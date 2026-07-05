import { randomUUID } from "node:crypto";

import { Prisma, prisma, type BrowserCrawlJob } from "@rdgw/database";
import { detectDareType, type RedditPost } from "@rdgw/crawler";

export class ExtensionJsonIngestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

interface ExtensionJsonJobState {
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

interface ExtensionJsonPost extends RedditPost {
  id: string;
  name: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  link_flair_text: string | null;
  score: number;
  ups?: number;
  upvoteCount: number | null;
  upvote_ratio: number | null;
  num_comments: number;
  shareCount: number | null;
  share_count?: number | null;
  crosspostCount: number;
  num_crossposts?: number;
  mediaUrls: string[];
  imageUrls: string[];
  videoUrls?: string[];
  embedUrls?: string[];
  tags?: string[];
  postType?: string | null;
  outboundUrl: string | null;
  thumbnail?: string | null;
  thumbnailUrl: string | null;
  url: string;
  url_overridden_by_dest?: string | null;
  permalink: string;
  created_utc: number;
  scrapedAt?: string;
  sourceUrl?: string;
}

interface BufferedJob {
  posts: Map<string, ExtensionJsonPost>;
  timer?: ReturnType<typeof setTimeout>;
  lastResult: FlushResult;
}

interface FlushResult {
  flushed: boolean;
  savedPosts: number;
  completionsFound: number;
  rawPostsSeen: number;
  postsProcessed: number;
}

const BATCH_SIZE = 10;
const IDLE_FLUSH_MS = 3 * 60 * 1000;
const buffers = new Map<string, BufferedJob>();

export async function ingestExtensionJsonPosts(jobId: string, body: unknown) {
  const payload = readObject(body);
  const posts = readPosts(payload.posts);
  const buffer = getBuffer(jobId);

  for (const post of posts) {
    buffer.posts.set(post.id, post);
  }

  scheduleIdleFlush(jobId);

  let flushResult: FlushResult = {
    flushed: false,
    savedPosts: 0,
    completionsFound: 0,
    rawPostsSeen: posts.length,
    postsProcessed: 0,
  };

  if (buffer.posts.size >= BATCH_SIZE) {
    flushResult = await flushExtensionJsonBuffer(jobId, "batch-size");
  }

  return {
    accepted: posts.length,
    buffered: getBuffer(jobId).posts.size,
    flushed: flushResult.flushed,
    savedPosts: flushResult.savedPosts,
    completionsFound: flushResult.completionsFound,
    totalBufferedPosts: getTotalBufferedPosts(),
  };
}

export async function flushExtensionJsonBuffer(jobId: string, reason = "manual"): Promise<FlushResult> {
  const buffer = buffers.get(jobId);
  if (!buffer || buffer.posts.size === 0) {
    return {
      flushed: false,
      savedPosts: 0,
      completionsFound: 0,
      rawPostsSeen: 0,
      postsProcessed: 0,
    };
  }

  if (buffer.timer) {
    clearTimeout(buffer.timer);
    buffer.timer = undefined;
  }

  const posts = [...buffer.posts.values()];
  buffer.posts.clear();

  const result = await savePostBatch(jobId, posts, reason);
  buffer.lastResult = result;
  return result;
}

function getBuffer(jobId: string) {
  let buffer = buffers.get(jobId);
  if (!buffer) {
    buffer = {
      posts: new Map(),
      lastResult: {
        flushed: false,
        savedPosts: 0,
        completionsFound: 0,
        rawPostsSeen: 0,
        postsProcessed: 0,
      },
    };
    buffers.set(jobId, buffer);
  }
  return buffer;
}

function scheduleIdleFlush(jobId: string) {
  const buffer = getBuffer(jobId);
  if (buffer.timer) clearTimeout(buffer.timer);

  buffer.timer = setTimeout(() => {
    void flushExtensionJsonBuffer(jobId, "idle-timeout").catch((error) => {
      console.error(`[extension-json-buffer] failed idle flush for ${jobId}`, error);
    });
  }, IDLE_FLUSH_MS);
}

async function savePostBatch(jobId: string, posts: ExtensionJsonPost[], reason: string): Promise<FlushResult> {
  const cleanPosts = dedupePosts(posts.map(normaliseJsonPost).filter((post): post is ExtensionJsonPost => Boolean(post)));
  if (cleanPosts.length === 0) {
    return {
      flushed: true,
      savedPosts: 0,
      completionsFound: 0,
      rawPostsSeen: posts.length,
      postsProcessed: 0,
    };
  }

  const job = await findExtensionJob(jobId);
  const state = getExtensionState(job);
  const crawlRunId = state.crawlRunId ?? (await createCrawlRun(job));

  const rows = cleanPosts.map((post) => {
    const mediaUrls = uniqueStrings([...(post.mediaUrls ?? []), ...(post.videoUrls ?? []), ...(post.embedUrls ?? [])]);
    const imageUrls = uniqueStrings(post.imageUrls ?? []);
    const outboundUrl = post.outboundUrl ?? post.url_overridden_by_dest ?? post.url ?? mediaUrls[0] ?? null;
    const thumbnailUrl = post.thumbnailUrl ?? post.thumbnail ?? imageUrls[0] ?? mediaUrls[0] ?? null;

    return {
      dbId: `pp_${randomUUID().replace(/-/g, "")}`,
      userDbId: `user_${randomUUID().replace(/-/g, "")}`,
      redditId: post.id,
      subreddit: post.subreddit || "unknown",
      authorUsername: post.author,
      title: post.title || "(untitled)",
      selftext: post.selftext ?? "",
      flair: post.link_flair_text ?? null,
      score: safeInteger(post.score),
      upvoteCount: post.upvoteCount ?? safeInteger(post.ups ?? post.score),
      upvoteRatio: typeof post.upvote_ratio === "number" ? post.upvote_ratio : null,
      commentCount: safeInteger(post.num_comments),
      shareCount: post.shareCount ?? post.share_count ?? null,
      crosspostCount: safeInteger(post.crosspostCount ?? post.num_crossposts ?? 0),
      mediaUrls,
      imageUrls,
      outboundUrl,
      thumbnailUrl,
      permalink: normalisePermalink(post.permalink),
      createdAtReddit: new Date(post.created_utc * 1000).toISOString(),
      rawJson: {
        ...post,
        batchReason: reason,
        crawledBy: "paidpolitely-extension-json",
      },
    };
  });

  await prisma.$executeRawUnsafe(
    `
WITH payload AS (
  SELECT *
  FROM jsonb_to_recordset($1::jsonb) AS p(
    "dbId" text,
    "userDbId" text,
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
    "createdAtReddit" text,
    "rawJson" jsonb
  )
),
valid_payload AS (
  SELECT *
  FROM payload
  WHERE "redditId" IS NOT NULL
    AND "redditId" <> ''
    AND "authorUsername" ~ '^[A-Za-z0-9_-]{3,20}$'
),
inserted_users AS (
  INSERT INTO "DgwUser" ("id", "username", "postCount", "createdAt", "updatedAt")
  SELECT DISTINCT
    "userDbId",
    "authorUsername",
    0,
    now(),
    now()
  FROM valid_payload
  ON CONFLICT ("username") DO NOTHING
),
new_posts AS (
  SELECT p."redditId", p."authorUsername"
  FROM valid_payload p
  LEFT JOIN "DgwPost" existing ON existing."redditId" = p."redditId"
  WHERE existing."redditId" IS NULL
),
upserted_posts AS (
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
    COALESCE(NULLIF(p."title", ''), '(untitled)'),
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
    'extension-json',
    p."createdAtReddit"::timestamptz,
    now(),
    now(),
    now()
  FROM valid_payload p
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
    "lastSeenAt" = now(),
    "updatedAt" = now()
  RETURNING "id", "redditId", "authorUsername"
),
post_count_updates AS (
  SELECT "authorUsername", COUNT(*)::int AS count
  FROM new_posts
  GROUP BY "authorUsername"
)
UPDATE "DgwUser" u
SET "postCount" = u."postCount" + pcu.count,
    "updatedAt" = now()
FROM post_count_updates pcu
WHERE u."username" = pcu."authorUsername";
    `,
    JSON.stringify(rows),
  );

  const saved = await prisma.dgwPost.findMany({
    where: { redditId: { in: cleanPosts.map((post) => post.id) } },
    select: { id: true, redditId: true },
  });

  const postIdByRedditId = new Map(saved.map((post) => [post.redditId, post.id]));
  const completionRows = buildCompletionRows(cleanPosts, postIdByRedditId);
  let completionsFound = 0;

  if (completionRows.playbook.length > 0) {
    const result = await prisma.playbookCompletion.createMany({
      data: completionRows.playbook,
      skipDuplicates: true,
    });
    completionsFound += result.count;
  }

  if (completionRows.community.length > 0) {
    const result = await prisma.communityCompletion.createMany({
      data: completionRows.community,
      skipDuplicates: true,
    });
    completionsFound += result.count;
  }

  const authors = new Set([...(state.authors ?? []), ...cleanPosts.map((post) => post.author)]);
  const nextState: ExtensionJsonJobState = {
    ...state,
    crawlRunId,
    pagesScanned: (state.pagesScanned ?? 0) + 1,
    rawPostsSeen: (state.rawPostsSeen ?? 0) + posts.length,
    postsProcessed: (state.postsProcessed ?? 0) + cleanPosts.length,
    completionsFound: (state.completionsFound ?? 0) + completionsFound,
    authors: [...authors].slice(0, 250),
    lastAfter: null,
  };

  await prisma.crawlRun.update({
    where: { id: crawlRunId },
    data: {
      pagesScanned: nextState.pagesScanned ?? 0,
      postsFound: nextState.postsProcessed ?? 0,
      completionsDetected: nextState.completionsFound ?? 0,
    },
  });

  await prisma.browserCrawlJob.update({
    where: { id: job.id },
    data: { state: toJsonState(nextState) },
  });

  return {
    flushed: true,
    savedPosts: cleanPosts.length,
    completionsFound,
    rawPostsSeen: posts.length,
    postsProcessed: cleanPosts.length,
  };
}

function buildCompletionRows(posts: ExtensionJsonPost[], postIdByRedditId: Map<string, string>) {
  const playbook: Prisma.PlaybookCompletionCreateManyInput[] = [];
  const community: Prisma.CommunityCompletionCreateManyInput[] = [];

  for (const post of posts) {
    const postId = postIdByRedditId.get(post.id);
    if (!postId) continue;

    const detection = detectDareType(post);
    if (detection.type === "playbook" && detection.dareSlug) {
      playbook.push({
        username: post.author,
        dareSlug: detection.dareSlug,
        postId,
        confidence: detection.confidence,
        verified: null,
      });
    }

    if (detection.type === "community" && detection.darerUsername) {
      community.push({
        username: post.author,
        darerUsername: detection.darerUsername,
        postId,
      });
    }
  }

  return { playbook, community };
}

async function findExtensionJob(jobId: string) {
  const job = await prisma.browserCrawlJob.findUnique({ where: { id: jobId } });
  if (!job) throw new ExtensionJsonIngestError("Extension task not found", 404);
  return job;
}

async function createCrawlRun(job: BrowserCrawlJob) {
  const run = await prisma.crawlRun.create({
    data: {
      type: job.type,
      target: job.target,
      status: "running",
    },
  });

  return run.id;
}

function getExtensionState(job: BrowserCrawlJob): ExtensionJsonJobState {
  const state = job.state;
  return isObject(state) ? (state as ExtensionJsonJobState) : {};
}

function readObject(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new ExtensionJsonIngestError("JSON object body required", 400);
  return value;
}

function readPosts(value: unknown) {
  if (!Array.isArray(value)) throw new ExtensionJsonIngestError("posts array is required", 400);
  return value.map((item) => readPost(item)).filter((post): post is ExtensionJsonPost => Boolean(post));
}

function readPost(value: unknown): ExtensionJsonPost | null {
  if (!isObject(value)) return null;
  const id = readString(value.id);
  const author = readString(value.author);
  const title = readString(value.title);
  const permalink = readString(value.permalink);

  if (!id || !author || !title || !permalink) return null;

  return {
    id,
    name: readString(value.name) || `t3_${id}`,
    subreddit: readString(value.subreddit) || "unknown",
    title,
    selftext: readString(value.selftext) ?? "",
    author,
    link_flair_text: readNullableString(value.link_flair_text),
    score: readNumber(value.score),
    ups: readNumber(value.ups),
    upvoteCount: readNullableNumber(value.upvoteCount),
    upvote_ratio: readNullableNumber(value.upvote_ratio),
    num_comments: readNumber(value.num_comments),
    shareCount: readNullableNumber(value.shareCount ?? value.share_count),
    share_count: readNullableNumber(value.share_count ?? value.shareCount),
    crosspostCount: readNumber(value.crosspostCount ?? value.num_crossposts),
    num_crossposts: readNumber(value.num_crossposts ?? value.crosspostCount),
    mediaUrls: readStringArray(value.mediaUrls),
    imageUrls: readStringArray(value.imageUrls),
    videoUrls: readStringArray(value.videoUrls),
    embedUrls: readStringArray(value.embedUrls),
    tags: readStringArray(value.tags),
    postType: readNullableString(value.postType),
    outboundUrl: readNullableString(value.outboundUrl),
    thumbnail: readNullableString(value.thumbnail),
    thumbnailUrl: readNullableString(value.thumbnailUrl),
    url: readString(value.url) || permalink,
    url_overridden_by_dest: readNullableString(value.url_overridden_by_dest),
    permalink,
    created_utc: readNumber(value.created_utc) || Math.floor(Date.now() / 1000),
    scrapedAt: readString(value.scrapedAt),
    sourceUrl: readString(value.sourceUrl),
  };
}

function normaliseJsonPost(post: ExtensionJsonPost | null): ExtensionJsonPost | null {
  if (!post) return null;
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(post.author)) return null;
  if (!post.id || !post.title) return null;
  return {
    ...post,
    id: post.id.replace(/^t3_/i, ""),
    subreddit: post.subreddit.replace(/^r\//i, "") || "unknown",
    permalink: normalisePermalink(post.permalink),
    score: safeInteger(post.score),
    ups: safeInteger(post.ups ?? post.score),
    num_comments: safeInteger(post.num_comments),
    shareCount: post.shareCount ?? post.share_count ?? null,
    crosspostCount: safeInteger(post.crosspostCount ?? post.num_crossposts ?? 0),
    num_crossposts: safeInteger(post.num_crossposts ?? post.crosspostCount ?? 0),
  };
}

function dedupePosts(posts: ExtensionJsonPost[]) {
  const map = new Map<string, ExtensionJsonPost>();
  for (const post of posts) map.set(post.id, post);
  return [...map.values()];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function normalisePermalink(value: string) {
  if (!value) return "";
  try {
    return new URL(value, "https://www.reddit.com").toString();
  } catch {
    return value;
  }
}

function safeInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function readNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? uniqueStrings(value.filter((item): item is string => typeof item === "string")) : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonState(state: ExtensionJsonJobState): Prisma.InputJsonObject {
  type JsonChild = Prisma.InputJsonValue | null;

  const clean = (value: unknown): JsonChild | undefined => {
    if (value === undefined) return undefined;

    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => clean(item))
        .filter((item): item is JsonChild => item !== undefined);
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

function getTotalBufferedPosts() {
  let total = 0;
  for (const buffer of buffers.values()) total += buffer.posts.size;
  return total;
}
