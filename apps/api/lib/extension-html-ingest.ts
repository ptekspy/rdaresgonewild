import { Prisma, prisma, type BrowserCrawlJob } from "@rdgw/database";
import { detectDareType, type RedditPost } from "@rdgw/crawler";

import { ExtensionTaskError, isExtensionJob } from "@/lib/extension-scheduler";

interface HtmlPostPayload {
  redditId: string;
  html?: string;
  subreddit: string;
  authorUsername: string;
  title: string;
  selftext?: string;
  flair?: string | null;
  score?: number;
  upvoteCount?: number | null;
  upvoteRatio?: number | null;
  commentCount?: number;
  shareCount?: number | null;
  crosspostCount?: number;
  mediaUrls?: string[];
  imageUrls?: string[];
  outboundUrl?: string | null;
  thumbnailUrl?: string | null;
  permalink: string;
  createdAtReddit?: string;
}

interface HtmlBatchBody {
  sourceUrl?: unknown;
  scrapeMode?: unknown;
  batchIndex?: unknown;
  batchCount?: unknown;
  stopped?: unknown;
  posts?: unknown;
}

interface HtmlJobState {
  source?: string;
  scope?: string;
  sort?: string;
  subreddit?: string;
  username?: string;
  jsonUrl?: string;
  maxPages?: number;
  stopAtKnown?: boolean;
  crawlRunId?: string;
  pagesScanned?: number;
  rawPostsSeen?: number;
  postsProcessed?: number;
  completionsFound?: number;
  authors?: string[];
  lastAfter?: string | null;
  exhausted?: boolean;
  reachedKnown?: boolean;
  forceBatchId?: string;
  forceOrder?: number;
  forceLabel?: string;
}

interface NormalisedHtmlPost extends Required<Omit<HtmlPostPayload, "html" | "createdAtReddit" | "flair" | "outboundUrl" | "thumbnailUrl" | "upvoteCount" | "upvoteRatio" | "shareCount">> {
  html: string;
  flair: string | null;
  outboundUrl: string | null;
  thumbnailUrl: string | null;
  upvoteCount: number | null;
  upvoteRatio: number | null;
  shareCount: number | null;
  createdAtReddit: string;
}

interface BulkPostRow {
  dbId: string;
  redditId: string;
  subreddit: string;
  authorUsername: string;
  title: string;
  selftext: string;
  flair: string | null;
  score: number;
  upvoteCount: number | null;
  upvoteRatio: number | null;
  commentCount: number;
  shareCount: number | null;
  crosspostCount: number;
  mediaUrls: string[];
  imageUrls: string[];
  outboundUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string;
  createdAtReddit: string;
  rawJson: Prisma.InputJsonObject;
}

interface UpsertedPostRow {
  id: string;
  redditId: string;
}

export interface ExtensionHtmlIngestResult {
  jobId: string;
  batchIndex: number;
  batchCount: number;
  pagesScanned: number;
  rawPostsSeen: number;
  postsProcessed: number;
  completionsFound: number;
  playbookCompletionsFound: number;
  communityCompletionsFound: number;
  authors: string[];
  exhausted: boolean;
  reachedKnown: boolean;
  shouldContinue: boolean;
  stopped: boolean;
}

const MAX_POSTS_PER_BATCH = readIntegerEnv("EXTENSION_HTML_MAX_POSTS_PER_BATCH", 600);
const MAX_HTML_CHARS_PER_POST = readIntegerEnv("EXTENSION_HTML_MAX_CHARS_PER_POST", 25_000);
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
const SUBREDDIT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_]{2,30}$/;

export async function ingestExtensionHtmlBatch(jobId: string, body: unknown): Promise<ExtensionHtmlIngestResult> {
  const job = await findExtensionJob(jobId);
  const state = getHtmlJobState(job);
  const payload = readHtmlBatchBody(body);
  const batchIndex = asNonNegativeInteger(payload.batchIndex, 0);
  const batchCount = asPositiveInteger(payload.batchCount, 1);
  const stopped = payload.stopped === true;
  const sourceUrl = typeof payload.sourceUrl === "string" ? payload.sourceUrl : job.url;
  const posts = readHtmlPosts(payload.posts).slice(0, MAX_POSTS_PER_BATCH);

  const crawlRunId = state.crawlRunId ?? (await createCrawlRun(job));

  if (posts.length === 0) {
    const nextState = {
      ...state,
      crawlRunId,
      pagesScanned: (state.pagesScanned ?? 0) + (batchIndex === 0 ? 1 : 0),
      rawPostsSeen: state.rawPostsSeen ?? 0,
      postsProcessed: state.postsProcessed ?? 0,
      completionsFound: state.completionsFound ?? 0,
      authors: state.authors ?? [],
      exhausted: batchIndex >= batchCount - 1,
      reachedKnown: false,
    };

    await updateJobState(job.id, nextState);
    await updateCrawlRun(crawlRunId, nextState);

    return buildResult(jobId, batchIndex, batchCount, nextState, 0, 0, stopped);
  }

  const redditIds = posts.map((post) => post.redditId);
  const existingPosts = await prisma.dgwPost.findMany({
    where: { redditId: { in: redditIds } },
    select: { redditId: true },
  });
  const existingIds = new Set(existingPosts.map((post) => post.redditId));

  await insertMissingUsers(posts);

  const rows = posts.map((post): BulkPostRow => ({
    dbId: crypto.randomUUID(),
    redditId: post.redditId,
    subreddit: post.subreddit,
    authorUsername: post.authorUsername,
    title: post.title,
    selftext: post.selftext,
    flair: post.flair,
    score: post.score,
    upvoteCount: post.upvoteCount,
    upvoteRatio: post.upvoteRatio,
    commentCount: post.commentCount,
    shareCount: post.shareCount,
    crosspostCount: post.crosspostCount,
    mediaUrls: post.mediaUrls,
    imageUrls: post.imageUrls,
    outboundUrl: post.outboundUrl,
    thumbnailUrl: post.thumbnailUrl,
    permalink: post.permalink,
    createdAtReddit: post.createdAtReddit,
    rawJson: {
      source: "extension-html",
      sourceUrl,
      scrapeMode: "post-card-html",
      html: post.html,
    },
  }));

  const upsertedRows = await bulkUpsertPosts(rows);
  await incrementPostCounts(posts.filter((post) => !existingIds.has(post.redditId)));

  const completionResult = await createCompletionsForRows(posts, upsertedRows);
  const authors = new Set(state.authors ?? []);
  for (const post of posts) authors.add(post.authorUsername);

  const nextState: HtmlJobState = {
    ...state,
    crawlRunId,
    pagesScanned: (state.pagesScanned ?? 0) + (batchIndex === 0 ? 1 : 0),
    rawPostsSeen: (state.rawPostsSeen ?? 0) + posts.length,
    postsProcessed: (state.postsProcessed ?? 0) + rows.length,
    completionsFound: (state.completionsFound ?? 0) + completionResult.created,
    authors: [...authors].slice(0, 500),
    lastAfter: null,
    exhausted: batchIndex >= batchCount - 1,
    reachedKnown: false,
  };

  await updateJobState(job.id, nextState);
  await updateCrawlRun(crawlRunId, nextState);

  return buildResult(
    jobId,
    batchIndex,
    batchCount,
    nextState,
    completionResult.playbookCreated,
    completionResult.communityCreated,
    stopped,
  );
}

async function findExtensionJob(jobId: string) {
  const job = await prisma.browserCrawlJob.findUnique({ where: { id: jobId } });
  if (!job || !isExtensionJob(job)) throw new ExtensionTaskError("Extension task not found", 404);
  return job;
}

async function createCrawlRun(job: BrowserCrawlJob) {
  const run = await prisma.crawlRun.create({
    data: { type: job.type, target: job.target },
    select: { id: true },
  });
  return run.id;
}

async function insertMissingUsers(posts: NormalisedHtmlPost[]) {
  const usernames = [...new Set(posts.map((post) => post.authorUsername).filter((username) => USERNAME_PATTERN.test(username)))];
  if (usernames.length === 0) return;

  const rows = usernames.map((username) => ({ id: crypto.randomUUID(), username }));

  await prisma.$executeRawUnsafe(
    `
      WITH payload AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS p("id" text, "username" text)
      )
      INSERT INTO "DgwUser" ("id", "username", "postCount", "createdAt", "updatedAt")
      SELECT p."id", p."username", 0, now(), now()
      FROM payload p
      WHERE p."username" ~ '^[A-Za-z0-9_-]{3,20}$'
      ON CONFLICT ("username") DO NOTHING
    `,
    JSON.stringify(rows),
  );
}

async function bulkUpsertPosts(rows: BulkPostRow[]) {
  if (rows.length === 0) return [] as UpsertedPostRow[];

  return prisma.$queryRawUnsafe<UpsertedPostRow[]>(
    `
      WITH payload AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS p(
          "dbId" text,
          "redditId" text,
          "subreddit" text,
          "authorUsername" text,
          "title" text,
          "selftext" text,
          "flair" text,
          "score" int,
          "upvoteCount" int,
          "upvoteRatio" double precision,
          "commentCount" int,
          "shareCount" int,
          "crosspostCount" int,
          "mediaUrls" jsonb,
          "imageUrls" jsonb,
          "outboundUrl" text,
          "thumbnailUrl" text,
          "permalink" text,
          "createdAtReddit" timestamptz,
          "rawJson" jsonb
        )
      )
      INSERT INTO "DgwPost" (
        "id",
        "subreddit",
        "redditId",
        "authorUsername",
        "title",
        "selftext",
        "flair",
        "score",
        "upvoteCount",
        "upvoteRatio",
        "commentCount",
        "shareCount",
        "crosspostCount",
        "mediaUrls",
        "imageUrls",
        "outboundUrl",
        "thumbnailUrl",
        "permalink",
        "rawJson",
        "source",
        "createdAtReddit",
        "crawledAt",
        "lastSeenAt",
        "updatedAt"
      )
      SELECT
        p."dbId",
        p."subreddit",
        p."redditId",
        p."authorUsername",
        p."title",
        COALESCE(p."selftext", ''),
        p."flair",
        COALESCE(p."score", 0),
        p."upvoteCount",
        p."upvoteRatio",
        COALESCE(p."commentCount", 0),
        p."shareCount",
        COALESCE(p."crosspostCount", 0),
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(p."mediaUrls", '[]'::jsonb))),
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(p."imageUrls", '[]'::jsonb))),
        p."outboundUrl",
        p."thumbnailUrl",
        p."permalink",
        p."rawJson",
        'extension-html',
        COALESCE(p."createdAtReddit", now()),
        now(),
        now(),
        now()
      FROM payload p
      WHERE p."redditId" IS NOT NULL
        AND p."redditId" <> ''
        AND p."authorUsername" ~ '^[A-Za-z0-9_-]{3,20}$'
      ON CONFLICT ("redditId") DO UPDATE SET
        "subreddit" = EXCLUDED."subreddit",
        "title" = EXCLUDED."title",
        "selftext" = EXCLUDED."selftext",
        "flair" = EXCLUDED."flair",
        "score" = EXCLUDED."score",
        "upvoteCount" = EXCLUDED."upvoteCount",
        "upvoteRatio" = EXCLUDED."upvoteRatio",
        "commentCount" = EXCLUDED."commentCount",
        "shareCount" = EXCLUDED."shareCount",
        "crosspostCount" = EXCLUDED."crosspostCount",
        "mediaUrls" = EXCLUDED."mediaUrls",
        "imageUrls" = EXCLUDED."imageUrls",
        "outboundUrl" = EXCLUDED."outboundUrl",
        "thumbnailUrl" = EXCLUDED."thumbnailUrl",
        "permalink" = EXCLUDED."permalink",
        "rawJson" = EXCLUDED."rawJson",
        "source" = EXCLUDED."source",
        "lastSeenAt" = now(),
        "updatedAt" = now()
      RETURNING "id", "redditId"
    `,
    JSON.stringify(rows),
  );
}

async function incrementPostCounts(newPosts: NormalisedHtmlPost[]) {
  if (newPosts.length === 0) return;

  const counts = new Map<string, number>();
  for (const post of newPosts) counts.set(post.authorUsername, (counts.get(post.authorUsername) ?? 0) + 1);

  const rows = [...counts.entries()].map(([username, count]) => ({ username, count }));

  await prisma.$executeRawUnsafe(
    `
      WITH payload AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS p("username" text, "count" int)
      )
      UPDATE "DgwUser" u
      SET "postCount" = u."postCount" + p."count",
          "updatedAt" = now()
      FROM payload p
      WHERE u."username" = p."username"
    `,
    JSON.stringify(rows),
  );
}

async function createCompletionsForRows(posts: NormalisedHtmlPost[], upsertedRows: UpsertedPostRow[]) {
  const postIdByRedditId = new Map(upsertedRows.map((row) => [row.redditId, row.id]));
  const playbookRows: Array<{ username: string; dareSlug: string; postId: string; confidence: number; verified: null }> = [];
  const communityRows: Array<{ username: string; darerUsername: string; postId: string; verified: null }> = [];

  for (const post of posts) {
    const postId = postIdByRedditId.get(post.redditId);
    if (!postId) continue;

    const redditPost = toRedditPost(post);
    const detection = detectDareType(redditPost);

    if (detection.type === "playbook" && detection.dareSlug) {
      playbookRows.push({
        username: post.authorUsername,
        dareSlug: detection.dareSlug,
        postId,
        confidence: detection.confidence,
        verified: null,
      });
    }

    if (detection.type === "community" && detection.darerUsername) {
      communityRows.push({
        username: post.authorUsername,
        darerUsername: detection.darerUsername,
        postId,
        verified: null,
      });
    }
  }

  const [playbook, community] = await Promise.all([
    playbookRows.length
      ? prisma.playbookCompletion.createMany({ data: playbookRows, skipDuplicates: true })
      : Promise.resolve({ count: 0 }),
    communityRows.length
      ? prisma.communityCompletion.createMany({ data: communityRows, skipDuplicates: true })
      : Promise.resolve({ count: 0 }),
  ]);

  return {
    created: playbook.count + community.count,
    playbookCreated: playbook.count,
    communityCreated: community.count,
  };
}

function toRedditPost(post: NormalisedHtmlPost): RedditPost {
  return {
    id: post.redditId,
    name: `t3_${post.redditId}`,
    subreddit: post.subreddit,
    title: post.title,
    selftext: post.selftext,
    author: post.authorUsername,
    link_flair_text: post.flair,
    score: post.score,
    ups: post.score,
    upvoteCount: post.upvoteCount ?? undefined,
    upvote_ratio: post.upvoteRatio ?? undefined,
    num_comments: post.commentCount,
    shareCount: post.shareCount ?? undefined,
    crosspostCount: post.crosspostCount,
    mediaUrls: post.mediaUrls,
    imageUrls: post.imageUrls,
    outboundUrl: post.outboundUrl ?? undefined,
    thumbnailUrl: post.thumbnailUrl ?? undefined,
    permalink: post.permalink,
    created_utc: Math.floor(Date.parse(post.createdAtReddit) / 1000),
    url: post.outboundUrl ?? post.mediaUrls[0] ?? post.permalink,
    thumbnail: post.thumbnailUrl ?? post.imageUrls[0] ?? "",
  } as RedditPost;
}

async function updateJobState(jobId: string, state: HtmlJobState) {
  await prisma.browserCrawlJob.update({
    where: { id: jobId },
    data: { state: toJsonState(state) },
  });
}

async function updateCrawlRun(crawlRunId: string, state: HtmlJobState) {
  await prisma.crawlRun.update({
    where: { id: crawlRunId },
    data: {
      pagesScanned: state.pagesScanned ?? 0,
      postsFound: state.postsProcessed ?? 0,
      completionsDetected: state.completionsFound ?? 0,
    },
  });
}

function buildResult(
  jobId: string,
  batchIndex: number,
  batchCount: number,
  state: HtmlJobState,
  playbookCompletionsFound: number,
  communityCompletionsFound: number,
  stopped: boolean,
): ExtensionHtmlIngestResult {
  return {
    jobId,
    batchIndex,
    batchCount,
    pagesScanned: state.pagesScanned ?? 0,
    rawPostsSeen: state.rawPostsSeen ?? 0,
    postsProcessed: state.postsProcessed ?? 0,
    completionsFound: state.completionsFound ?? 0,
    playbookCompletionsFound,
    communityCompletionsFound,
    authors: state.authors ?? [],
    exhausted: Boolean(state.exhausted),
    reachedKnown: Boolean(state.reachedKnown),
    shouldContinue: batchIndex < batchCount - 1,
    stopped,
  };
}

function readHtmlBatchBody(body: unknown): HtmlBatchBody {
  if (!isObject(body)) throw new ExtensionTaskError("JSON object body required", 400);
  return body as HtmlBatchBody;
}

function readHtmlPosts(value: unknown): NormalisedHtmlPost[] {
  if (!Array.isArray(value)) throw new ExtensionTaskError("Body must contain a posts array", 400);

  const seen = new Set<string>();
  const posts: NormalisedHtmlPost[] = [];

  for (const item of value) {
    if (!isObject(item)) continue;

    const redditId = readCleanString(item.redditId).replace(/^t3_/i, "");
    const authorUsername = readCleanString(item.authorUsername).replace(/^u\//i, "");
    const subreddit = readCleanString(item.subreddit).replace(/^r\//i, "");
    const title = readCleanString(item.title);
    const permalink = readCleanString(item.permalink);

    if (!redditId || seen.has(redditId)) continue;
    if (!USERNAME_PATTERN.test(authorUsername)) continue;
    if (!SUBREDDIT_PATTERN.test(subreddit)) continue;
    if (!title || !permalink) continue;

    seen.add(redditId);
    posts.push({
      redditId,
      html: readCleanString(item.html).slice(0, MAX_HTML_CHARS_PER_POST),
      subreddit,
      authorUsername,
      title: title.slice(0, 600),
      selftext: readCleanString(item.selftext).slice(0, 10_000),
      flair: nullableString(item.flair, 150),
      score: asNonNegativeInteger(item.score, 0),
      upvoteCount: nullableInteger(item.upvoteCount),
      upvoteRatio: nullableNumber(item.upvoteRatio),
      commentCount: asNonNegativeInteger(item.commentCount, 0),
      shareCount: nullableInteger(item.shareCount),
      crosspostCount: asNonNegativeInteger(item.crosspostCount, 0),
      mediaUrls: readStringArray(item.mediaUrls, 25),
      imageUrls: readStringArray(item.imageUrls, 25),
      outboundUrl: nullableString(item.outboundUrl, 2000),
      thumbnailUrl: nullableString(item.thumbnailUrl, 2000),
      permalink,
      createdAtReddit: normaliseDateString(item.createdAtReddit),
    });
  }

  return posts;
}

function getHtmlJobState(job: BrowserCrawlJob): HtmlJobState {
  if (isObject(job.state)) return job.state as HtmlJobState;
  return { source: "extension-scheduler" };
}

function toJsonState(state: HtmlJobState): Prisma.InputJsonObject {
  type JsonChild = Prisma.InputJsonValue | null;

  const clean = (value: unknown): JsonChild | undefined => {
    if (value === undefined) return undefined;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;

    if (Array.isArray(value)) {
      return value.map((item) => clean(item)).filter((item): item is JsonChild => item !== undefined);
    }

    if (typeof value === "object") {
      const output: Record<string, JsonChild> = {};
      for (const [key, childValue] of Object.entries(value)) {
        const cleaned = clean(childValue);
        if (cleaned !== undefined) output[key] = cleaned;
      }
      return output as Prisma.InputJsonObject;
    }

    return String(value);
  };

  const cleaned = clean(state);
  return (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) ? cleaned : {}) as Prisma.InputJsonObject;
}

function readCleanString(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function nullableString(value: unknown, maxLength: number) {
  const text = readCleanString(value).slice(0, maxLength);
  return text || null;
}

function nullableInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normaliseDateString(value: unknown) {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }

  return new Date().toISOString();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asPositiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function asNonNegativeInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function readIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
