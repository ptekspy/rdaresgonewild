import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Prisma, prisma } from "@rdgw/database";

const HOST = process.env.REDDIT_LOCAL_WRITER_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.REDDIT_LOCAL_WRITER_PORT || "8791", 10);
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_POSTS_PER_REQUEST = 250;

interface ExtensionRedditPost {
  id: string;
  name: string;
  subreddit: string;
  title: string;
  selftext?: string;
  author: string;
  link_flair_text?: string | null;
  score?: number;
  upvoteCount?: number | null;
  upvote_ratio?: number | null;
  num_comments?: number;
  shareCount?: number | null;
  crosspostCount?: number;
  mediaUrls?: string[];
  imageUrls?: string[];
  outboundUrl?: string | null;
  thumbnailUrl?: string | null;
  permalink: string;
  created_utc: number;
  rawJson?: unknown;
}

createServer(async (request, response) => {
  try {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`);

    if (request.method === "GET" && url.pathname === "/health") {
      await prisma.$queryRaw`SELECT 1`;
      sendJson(response, 200, {
        ok: true,
        service: "paid-politely-reddit-local-db-writer",
        now: new Date().toISOString(),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/session/start") {
      const body = await readJsonBody(request);
      const uploadToken = createUploadToken();
      const sourceUrl = parseRedditSourceUrl(body.sourceUrl);
      const extensionInstallId = normaliseInstallId(body.extensionInstallId) || "local-extension";
      const clientVersion = typeof body.clientVersion === "string" ? body.clientVersion.slice(0, 64) : undefined;

      const session = await prisma.extensionIngestSession.create({
        data: {
          redditUsername: "local-dom-crawler",
          extensionInstallId,
          uploadTokenHash: hashUploadToken(uploadToken),
          clientVersion,
          crawlMode: "local-dom",
          sourceUrl,
        },
        select: {
          id: true,
          redditUsername: true,
          crawlMode: true,
          sourceUrl: true,
          status: true,
          startedAt: true,
        },
      });

      sendJson(response, 200, { session, uploadToken, maxBatchSize: MAX_POSTS_PER_REQUEST });
      return;
    }

    if (request.method === "POST" && url.pathname === "/posts/stream") {
      const body = await readJsonBody(request);
      const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
      const uploadToken = typeof body.uploadToken === "string" ? body.uploadToken : "";
      const posts = parsePostBatch(body.posts);
      const completed = body.completed === true;

      if (!sessionId || !uploadToken) return sendJson(response, 400, { error: "sessionId and uploadToken are required" });
      if (!posts) return sendJson(response, 400, { error: `posts must be an array of ${MAX_POSTS_PER_REQUEST} or fewer valid Reddit posts` });

      const session = await prisma.extensionIngestSession.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          uploadTokenHash: true,
          status: true,
        },
      });

      if (!session) return sendJson(response, 404, { error: "Unknown ingest session" });
      if (!verifyUploadToken(uploadToken, session.uploadTokenHash)) return sendJson(response, 401, { error: "Invalid upload token" });
      if (session.status !== "running") return sendJson(response, 409, { error: `Session is ${session.status}` });

      let accepted = 0;

      for (const post of posts) {
        await upsertPost(session.id, post);
        accepted++;
      }

      const updatedSession = await prisma.extensionIngestSession.update({
        where: { id: session.id },
        data: {
          pagesScanned: { increment: 1 },
          postsReceived: { increment: accepted },
          status: completed ? "completed" : "running",
          completedAt: completed ? new Date() : undefined,
        },
        select: {
          id: true,
          status: true,
          pagesScanned: true,
          postsReceived: true,
          updatedAt: true,
        },
      });

      sendJson(response, 200, { accepted, session: updatedSession });
      return;
    }

    if (request.method === "POST" && url.pathname === "/session/complete") {
      const body = await readJsonBody(request);
      const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
      const uploadToken = typeof body.uploadToken === "string" ? body.uploadToken : "";
      const status = body.status === "stopped" ? "stopped" : "completed";

      if (!sessionId || !uploadToken) return sendJson(response, 400, { error: "sessionId and uploadToken are required" });

      const session = await prisma.extensionIngestSession.findUnique({
        where: { id: sessionId },
        select: { id: true, uploadTokenHash: true, status: true },
      });

      if (!session) return sendJson(response, 404, { error: "Unknown ingest session" });
      if (!verifyUploadToken(uploadToken, session.uploadTokenHash)) return sendJson(response, 401, { error: "Invalid upload token" });

      const updatedSession = await prisma.extensionIngestSession.update({
        where: { id: session.id },
        data: {
          status,
          completedAt: new Date(),
        },
        select: {
          id: true,
          status: true,
          pagesScanned: true,
          postsReceived: true,
          updatedAt: true,
        },
      });

      sendJson(response, 200, { session: updatedSession });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(PORT, HOST, () => {
  console.log(`Paid Politely local Reddit DB writer listening on http://${HOST}:${PORT}`);
});

async function upsertPost(sessionId: string, post: ExtensionRedditPost) {
  const createdAtReddit = new Date(post.created_utc * 1000);
  const rawJson = post.rawJson === undefined ? undefined : (post.rawJson as Prisma.InputJsonValue);

  await prisma.dgwUser.upsert({
    where: { username: post.author },
    update: {},
    create: { username: post.author },
  });

  await prisma.dgwPost.upsert({
    where: { redditId: post.id },
    update: {
      subreddit: post.subreddit,
      authorUsername: post.author,
      title: post.title,
      selftext: post.selftext ?? "",
      flair: post.link_flair_text ?? null,
      score: post.score ?? 0,
      upvoteCount: post.upvoteCount ?? null,
      upvoteRatio: post.upvote_ratio ?? null,
      commentCount: post.num_comments ?? 0,
      shareCount: post.shareCount ?? null,
      crosspostCount: post.crosspostCount ?? 0,
      mediaUrls: post.mediaUrls ?? [],
      imageUrls: post.imageUrls ?? [],
      outboundUrl: post.outboundUrl ?? null,
      thumbnailUrl: post.thumbnailUrl ?? null,
      permalink: post.permalink,
      rawJson,
      source: "extension-dom",
      ingestSessionId: sessionId,
      lastSeenAt: new Date(),
    },
    create: {
      subreddit: post.subreddit,
      redditId: post.id,
      authorUsername: post.author,
      title: post.title,
      selftext: post.selftext ?? "",
      flair: post.link_flair_text ?? null,
      score: post.score ?? 0,
      upvoteCount: post.upvoteCount ?? null,
      upvoteRatio: post.upvote_ratio ?? null,
      commentCount: post.num_comments ?? 0,
      shareCount: post.shareCount ?? null,
      crosspostCount: post.crosspostCount ?? 0,
      mediaUrls: post.mediaUrls ?? [],
      imageUrls: post.imageUrls ?? [],
      outboundUrl: post.outboundUrl ?? null,
      thumbnailUrl: post.thumbnailUrl ?? null,
      permalink: post.permalink,
      rawJson,
      source: "extension-dom",
      ingestSessionId: sessionId,
      createdAtReddit,
      lastSeenAt: new Date(),
    },
    select: { id: true },
  });
}

function parsePostBatch(value: unknown) {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_POSTS_PER_REQUEST) return null;

  const posts: ExtensionRedditPost[] = [];
  for (const item of value) {
    const post = parsePost(item);
    if (!post) return null;
    posts.push(post);
  }

  return posts;
}

function parsePost(value: unknown): ExtensionRedditPost | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const id = asString(record.id);
  const name = asString(record.name);
  const subreddit = asString(record.subreddit);
  const title = asString(record.title);
  const author = normaliseUsername(record.author);
  const permalink = normalisePermalink(asString(record.permalink));
  const createdUtc = asNumber(record.created_utc);

  if (!id || !name || !subreddit || !title || !author || !permalink || !createdUtc) return null;

  return {
    id,
    name,
    subreddit,
    title,
    selftext: asString(record.selftext) ?? "",
    author,
    link_flair_text: asNullableString(record.link_flair_text),
    score: asNumber(record.score) ?? 0,
    upvoteCount: asNullableNumber(record.upvoteCount),
    upvote_ratio: asNullableNumber(record.upvote_ratio),
    num_comments: asNumber(record.num_comments) ?? 0,
    shareCount: asNullableNumber(record.shareCount),
    crosspostCount: asNumber(record.crosspostCount) ?? 0,
    mediaUrls: asStringArray(record.mediaUrls),
    imageUrls: asStringArray(record.imageUrls),
    outboundUrl: asNullableUrl(record.outboundUrl),
    thumbnailUrl: asNullableUrl(record.thumbnailUrl),
    permalink,
    created_utc: createdUtc,
    rawJson: record.rawJson,
  };
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  if (response.headersSent) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};

  const text = Buffer.concat(chunks).toString("utf8");
  const json = JSON.parse(text);
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("JSON body must be an object");

  return json as Record<string, unknown>;
}

function parseRedditSourceUrl(value: unknown) {
  if (typeof value !== "string") return undefined;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!/(^|\.)reddit\.com$/.test(host)) return undefined;
    url.hash = "";
    return url.toString().slice(0, 2048);
  } catch {
    return undefined;
  }
}

function createUploadToken() {
  return randomBytes(32).toString("base64url");
}

function hashUploadToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function verifyUploadToken(token: string, expectedHash: string) {
  const actual = Buffer.from(hashUploadToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;

function normaliseUsername(value: unknown) {
  if (typeof value !== "string") return null;
  const username = value.replace(/^u\//i, "").trim();
  return USERNAME_PATTERN.test(username) ? username : null;
}

function normaliseInstallId(value: unknown) {
  if (typeof value !== "string") return null;
  const installId = value.trim();
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(installId) ? installId : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asNullableUrl(value: unknown) {
  const text = asString(value);
  if (!text) return null;
  return text.startsWith("http://") || text.startsWith("https://") ? text : null;
}

function normalisePermalink(value: string | null) {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://www.reddit.com${value.startsWith("/") ? value : `/${value}`}`;
}
