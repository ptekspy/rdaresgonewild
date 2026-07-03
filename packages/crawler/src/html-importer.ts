import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Prisma, prisma } from "@rdgw/database";
import type { RedditPost } from "./reddit.js";
import { detectDareType } from "./detector.js";

export interface HtmlImportResult {
  postsParsed: number;
  postsProcessed: number;
  completionsFound: number;
  playbookCompletionsFound: number;
  communityCompletionsFound: number;
  authors: string[];
}

type AttributeMap = Record<string, string>;
type ImportBatchResult = {
  postsProcessed: number;
  completionsFound: number;
  playbookCompletionsFound: number;
  communityCompletionsFound: number;
};
type PostIdRow = { id: string; redditId: string };
type CompletionInsertRow = { id: string };

export type HtmlImportProgress =
  | { phase: "reading"; filePath: string }
  | { phase: "parsed"; postsParsed: number; batchSize: number; totalBatches: number }
  | {
      phase: "batch";
      batchNumber: number;
      totalBatches: number;
      postsProcessed: number;
      totalPosts: number;
      batchPosts: number;
      batchCompletionsFound: number;
      completionsFound: number;
      playbookCompletionsFound: number;
      communityCompletionsFound: number;
    }
  | { phase: "completed"; result: HtmlImportResult };

export interface HtmlImportOptions {
  batchSize?: number;
  crawlRunType?: string;
  target?: string;
  subreddit?: string;
  onProgress?: (progress: HtmlImportProgress) => void;
}

const POST_BLOCK_PATTERN = /<shreddit-post(?=[\s>])([^>]*)>([\s\S]*?)<\/shreddit-post>/g;
const FLAIR_BLOCK_PATTERN =
  /<shreddit-post-flair(?=[\s>])([^>]*)>([\s\S]*?)<\/shreddit-post-flair>/g;
const DEFAULT_IMPORT_BATCH_SIZE = 100;
const DEFAULT_SUBREDDIT = "daresgonewild";

export function parseDaresGoneWildHtml(html: string): RedditPost[] {
  const flairsByPostId = parseFlairs(html);
  const posts = new Map<string, RedditPost>();

  for (const match of html.matchAll(POST_BLOCK_PATTERN)) {
    const attrs = parseAttributes(match[1] ?? "");
    const innerHtml = match[2] ?? "";
    const post = postFromAttributes(attrs, innerHtml, flairsByPostId);

    if (post) {
      posts.set(post.name, post);
    }
  }

  return [...posts.values()];
}

export async function importHtmlFile(
  filePath: string,
  options: HtmlImportOptions = {}
): Promise<HtmlImportResult> {
  options.onProgress?.({ phase: "reading", filePath });
  const html = await fs.readFile(filePath, "utf8");
  return importHtmlString(html, {
    ...options,
    target: options.target ?? path.basename(filePath),
  });
}

export async function importHtmlString(
  html: string,
  options: HtmlImportOptions = {}
): Promise<HtmlImportResult> {
  const batchSize = normaliseBatchSize(options.batchSize);
  const target = options.target ?? "html_string";
  const posts = filterBySubreddit(parseDaresGoneWildHtml(html), options.subreddit);
  const batches = chunk(posts, batchSize);
  const authors = uniqueValues(posts.map((post) => post.author));

  options.onProgress?.({
    phase: "parsed",
    postsParsed: posts.length,
    batchSize,
    totalBatches: batches.length,
  });

  const crawlRun = await prisma.crawlRun.create({
    data: {
      type: options.crawlRunType ?? "html_import",
      target,
      pagesScanned: 1,
      postsFound: posts.length,
    },
  });

  let postsProcessed = 0;
  let completionsFound = 0;
  let playbookCompletionsFound = 0;
  let communityCompletionsFound = 0;

  try {
    for (let index = 0; index < batches.length; index++) {
      const batchResult = await importPostBatch(batches[index]);
      postsProcessed += batchResult.postsProcessed;
      completionsFound += batchResult.completionsFound;
      playbookCompletionsFound += batchResult.playbookCompletionsFound;
      communityCompletionsFound += batchResult.communityCompletionsFound;

      await prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: {
          postsFound: postsProcessed,
          completionsDetected: completionsFound,
        },
      });

      options.onProgress?.({
        phase: "batch",
        batchNumber: index + 1,
        totalBatches: batches.length,
        postsProcessed,
        totalPosts: posts.length,
        batchPosts: batchResult.postsProcessed,
        batchCompletionsFound: batchResult.completionsFound,
        completionsFound,
        playbookCompletionsFound,
        communityCompletionsFound,
      });
    }

    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        postsFound: postsProcessed,
        completionsDetected: completionsFound,
      },
    });

    const result = {
      postsParsed: posts.length,
      postsProcessed,
      completionsFound,
      playbookCompletionsFound,
      communityCompletionsFound,
      authors,
    };
    options.onProgress?.({ phase: "completed", result });
    return result;
  } catch (err) {
    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: { status: "failed", completedAt: new Date(), error: String(err) },
    });
    throw err;
  }
}

async function importPostBatch(posts: RedditPost[]): Promise<ImportBatchResult> {
  if (posts.length === 0) {
    return {
      postsProcessed: 0,
      completionsFound: 0,
      playbookCompletionsFound: 0,
      communityCompletionsFound: 0,
    };
  }

  const detections = posts.map((post) => ({ post, detection: detectDareType(post) }));

  return prisma.$transaction(async (tx) => {
    await tx.dgwUser.createMany({
      data: uniqueValues(posts.map((post) => post.author)).map((username) => ({ username })),
      skipDuplicates: true,
    });

    const existingPostIds = await fetchPostIds(
      posts.map((post) => post.id),
      (query) => tx.$queryRaw<PostIdRow[]>(query)
    );
    const newPosts = posts.filter((post) => !existingPostIds.has(post.id));

    await incrementUserPostCounts(
      new Map(countBy(newPosts, (post) => post.author)),
      (query) => tx.$executeRaw(query)
    );
    await upsertPosts(posts, (query) => tx.$executeRaw(query));

    const detectedPostIds = uniqueValues(
      detections
        .filter(({ detection }) => detection.type !== "none")
        .map(({ post }) => post.id)
    );
    const postIds = await fetchPostIds(detectedPostIds, (query) => tx.$queryRaw<PostIdRow[]>(query));

    const playbookCompletions = new Map<
      string,
      { username: string; dareSlug: string; postId: string; confidence: number }
    >();
    const communityCompletions = new Map<
      string,
      { username: string; darerUsername: string; postId: string }
    >();

    for (const { post, detection } of detections) {
      const postId = postIds.get(post.id);
      if (!postId) continue;

      if (detection.type === "playbook" && detection.dareSlug) {
        const key = `${post.author}\0${detection.dareSlug}`;
        if (!playbookCompletions.has(key)) {
          playbookCompletions.set(key, {
            username: post.author,
            dareSlug: detection.dareSlug,
            postId,
            confidence: detection.confidence,
          });
        }
      }

      if (detection.type === "community" && detection.darerUsername) {
        const key = `${post.author}\0${postId}`;
        if (!communityCompletions.has(key)) {
          communityCompletions.set(key, {
            username: post.author,
            darerUsername: detection.darerUsername,
            postId,
          });
        }
      }
    }

    const playbookCompletionsFound = await insertPlaybookCompletions(
      [...playbookCompletions.values()],
      (query) => tx.$queryRaw<CompletionInsertRow[]>(query)
    );
    const communityCompletionsFound = await insertCommunityCompletions(
      [...communityCompletions.values()],
      (query) => tx.$queryRaw<CompletionInsertRow[]>(query)
    );

    return {
      postsProcessed: posts.length,
      completionsFound: playbookCompletionsFound + communityCompletionsFound,
      playbookCompletionsFound,
      communityCompletionsFound,
    };
  });
}

async function incrementUserPostCounts(
  postCounts: Map<string, number>,
  executeRaw: (query: Prisma.Sql) => Promise<unknown>
) {
  const rows = [...postCounts.entries()].map(
    ([username, count]) => Prisma.sql`(${username}, ${count})`
  );
  if (rows.length === 0) return;

  await executeRaw(Prisma.sql`
    UPDATE "DgwUser" AS user_record
    SET
      "postCount" = user_record."postCount" + post_count.value::integer,
      "updatedAt" = CURRENT_TIMESTAMP
    FROM (VALUES ${Prisma.join(rows)}) AS post_count(username, value)
    WHERE user_record."username" = post_count.username
  `);
}

async function upsertPosts(
  posts: RedditPost[],
  executeRaw: (query: Prisma.Sql) => Promise<unknown>
) {
  const now = new Date();
  const rows = posts.map((post) => {
    const createdAtReddit = new Date(post.created_utc * 1000);
    return Prisma.sql`(
      ${randomUUID()},
      ${post.id},
      ${post.author},
      ${post.title},
      ${post.selftext ?? ""},
      ${post.link_flair_text ?? null},
      ${post.score},
      ${post.upvoteCount},
      ${post.upvote_ratio},
      ${post.num_comments},
      ${post.shareCount},
      ${post.crosspostCount},
      ${textArraySql(post.mediaUrls)},
      ${textArraySql(post.imageUrls)},
      ${post.outboundUrl},
      ${post.thumbnailUrl},
      ${post.permalink},
      ${createdAtReddit},
      ${now},
      ${now}
    )`;
  });
  if (rows.length === 0) return;

  await executeRaw(Prisma.sql`
    INSERT INTO "DgwPost" (
      "id",
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
      "createdAtReddit",
      "crawledAt",
      "updatedAt"
    )
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("redditId") DO UPDATE SET
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
      "flair" = EXCLUDED."flair",
      "updatedAt" = CURRENT_TIMESTAMP
  `);
}

async function fetchPostIds(
  redditIds: string[],
  queryRaw: (query: Prisma.Sql) => Promise<PostIdRow[]>
) {
  if (redditIds.length === 0) return new Map<string, string>();

  const rows = await queryRaw(Prisma.sql`
    SELECT "id", "redditId"
    FROM "DgwPost"
    WHERE "redditId" IN (${Prisma.join(redditIds)})
  `);

  return new Map(rows.map((row) => [row.redditId, row.id]));
}

async function insertPlaybookCompletions(
  completions: Array<{ username: string; dareSlug: string; postId: string; confidence: number }>,
  queryRaw: (query: Prisma.Sql) => Promise<CompletionInsertRow[]>
) {
  const now = new Date();
  const rows = completions.map(
    (completion) => Prisma.sql`(
      ${randomUUID()},
      ${completion.username},
      ${completion.dareSlug},
      ${completion.postId},
      ${completion.confidence},
      ${now}
    )`
  );
  if (rows.length === 0) return 0;

  const inserted = await queryRaw(Prisma.sql`
    INSERT INTO "PlaybookCompletion" (
      "id",
      "username",
      "dareSlug",
      "postId",
      "confidence",
      "detectedAt"
    )
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("username", "dareSlug") DO NOTHING
    RETURNING "id"
  `);

  return inserted.length;
}

async function insertCommunityCompletions(
  completions: Array<{ username: string; darerUsername: string; postId: string }>,
  queryRaw: (query: Prisma.Sql) => Promise<CompletionInsertRow[]>
) {
  const now = new Date();
  const rows = completions.map(
    (completion) => Prisma.sql`(
      ${randomUUID()},
      ${completion.username},
      ${completion.darerUsername},
      ${completion.postId},
      ${now}
    )`
  );
  if (rows.length === 0) return 0;

  const inserted = await queryRaw(Prisma.sql`
    INSERT INTO "CommunityCompletion" (
      "id",
      "username",
      "darerUsername",
      "postId",
      "detectedAt"
    )
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("username", "postId") DO NOTHING
    RETURNING "id"
  `);

  return inserted.length;
}

function postFromAttributes(
  attrs: AttributeMap,
  innerHtml: string,
  flairsByPostId: Map<string, string>
): RedditPost | null {
  const name = attrs.id;
  const author = attrs.author;
  const title = attrs["post-title"];
  const permalink = attrs.permalink;

  if (!name?.startsWith("t3_") || !author || !title || !permalink) {
    return null;
  }

  const createdUtc = parseCreatedUtc(attrs["created-timestamp"]);
  if (!createdUtc) return null;

  const absolutePermalink = absolutizeRedditUrl(permalink);
  const outboundUrl = extractHtmlOutboundUrl(attrs["content-href"], absolutePermalink);
  const mediaUrls = uniqueValues([
    ...(outboundUrl ? [outboundUrl] : []),
    ...extractHtmlMediaUrls(innerHtml),
  ]);
  const imageUrls = mediaUrls.filter(isImageUrl);

  return {
    id: name.slice(3),
    name,
    subreddit: inferSubredditFromPermalink(absolutePermalink) ?? DEFAULT_SUBREDDIT,
    title,
    selftext: extractSelftext(innerHtml),
    author,
    link_flair_text: flairsByPostId.get(name) ?? null,
    score: parseInteger(attrs.score),
    upvoteCount: parseInteger(attrs.score),
    upvote_ratio: parseFloatNumber(attrs["upvote-ratio"]),
    num_comments: parseInteger(attrs["comment-count"]),
    shareCount: parseIntegerOrNull(attrs["share-count"]),
    crosspostCount: parseInteger(attrs["crosspost-count"] ?? attrs["crosspost-counts"]),
    mediaUrls,
    imageUrls,
    outboundUrl,
    thumbnailUrl: imageUrls[0] ?? null,
    permalink: absolutePermalink,
    created_utc: createdUtc,
  };
}

function parseFlairs(html: string) {
  const flairs = new Map<string, string>();

  for (const match of html.matchAll(FLAIR_BLOCK_PATTERN)) {
    const attrs = parseAttributes(match[1] ?? "");
    const postId = attrs["post-id"];
    if (!postId) continue;

    const innerHtml = match[2] ?? "";
    const ariaLabel = innerHtml.match(/\baria-label\s*=\s*"Flair:\s*([^"]+)"/i)?.[1];
    const flair = normaliseWhitespace(decodeHtml(ariaLabel ?? textContent(innerHtml)));

    if (flair) {
      flairs.set(postId, flair);
    }
  }

  return flairs;
}

function parseAttributes(source: string): AttributeMap {
  const attrs: AttributeMap = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of source.matchAll(pattern)) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = decodeHtml(value);
  }

  return attrs;
}

function extractSelftext(innerHtml: string) {
  const articleBody =
    innerHtml.match(/<div[^>]*\bproperty\s*=\s*"schema:articleBody"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
    "";

  return textContent(articleBody);
}

function textContent(html: string) {
  return normaliseWhitespace(
    decodeHtml(
      html
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function normaliseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseCreatedUtc(value?: string) {
  if (!value) return 0;

  const normalised = value
    .replace(/\.(\d{3})\d+/, ".$1")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const timestamp = Date.parse(normalised);

  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0;
}

function parseInteger(value?: string) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseIntegerOrNull(value?: string) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloatNumber(value?: string) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function absolutizeRedditUrl(value: string) {
  return value.startsWith("http") ? value : `https://www.reddit.com${value}`;
}

function inferSubredditFromPermalink(permalink: string) {
  const match = permalink.match(/\/r\/([^/]+)\//i);
  return match?.[1] ?? null;
}

function extractHtmlOutboundUrl(value: string | undefined, permalink: string) {
  const url = normaliseMediaUrl(value);
  if (!url) return null;
  return stripUrlQuery(url) === stripUrlQuery(permalink) ? null : url;
}

function extractHtmlMediaUrls(html: string) {
  const urls = new Set<string>();
  const attrPattern = /\b(?:href|poster|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  const srcsetPattern = /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

  for (const match of html.matchAll(attrPattern)) {
    const url = normaliseMediaUrl(match[1] ?? match[2] ?? match[3]);
    if (url && isLikelyPostMediaUrl(url)) urls.add(url);
  }

  for (const match of html.matchAll(srcsetPattern)) {
    const srcset = decodeHtml(match[1] ?? match[2] ?? "");
    for (const candidate of srcset.split(",")) {
      const url = normaliseMediaUrl(candidate.trim().split(/\s+/)[0]);
      if (url && isLikelyPostMediaUrl(url)) urls.add(url);
    }
  }

  return [...urls];
}

function normaliseMediaUrl(value?: string) {
  if (!value) return null;
  const decoded = decodeHtml(value.trim());
  if (!decoded.startsWith("http://") && !decoded.startsWith("https://")) return null;
  return decoded;
}

function isLikelyPostMediaUrl(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("profileicon") || lower.includes("snoovatar") || lower.includes("/avatar")) {
    return false;
  }

  return (
    isImageUrl(url) ||
    /\.(?:gifv|m3u8|mp4|webm)(?:[?#]|$)/i.test(url) ||
    /\/\/(?:v\.redd\.it|redgifs\.com|www\.redgifs\.com|imgur\.com|i\.imgur\.com)\//i.test(url)
  );
}

function isImageUrl(url: string) {
  return /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(url) || /\/\/(?:i|preview)\.redd\.it\//i.test(url);
}

function stripUrlQuery(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return value.replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

function textArraySql(values: string[]) {
  if (values.length === 0) return Prisma.sql`ARRAY[]::text[]`;
  return Prisma.sql`ARRAY[${Prisma.join(values)}]::text[]`;
}

function filterBySubreddit(posts: RedditPost[], subreddit?: string) {
  if (!subreddit) return posts;
  const needle = `/r/${subreddit.toLowerCase()}/`;
  return posts.filter((post) => post.permalink.toLowerCase().includes(needle));
}

function normaliseBatchSize(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return DEFAULT_IMPORT_BATCH_SIZE;
  return Math.max(1, Math.floor(value));
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

function countBy<T>(values: T[], getKey: (value: T) => string) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = getKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
