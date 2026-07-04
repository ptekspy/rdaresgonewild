import { createCompletionsForPost } from "@rdgw/crawler/detector";
import type { RedditPost } from "@rdgw/crawler/reddit";
import { Prisma, prisma } from "@rdgw/database";
import { jsonError, jsonResponse } from "@/lib/http";
import { parsePostBatch, type ExtensionRedditPost } from "@/lib/reddit";
import { verifyUploadToken } from "@/lib/session";

export const MAX_EXTENSION_BATCH_SIZE = 100;

export async function ingestExtensionPosts(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Invalid JSON body");

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const uploadToken = typeof body.uploadToken === "string" ? body.uploadToken : "";
  const posts = parsePostBatch(body.posts);
  const nextCursor = typeof body.nextCursor === "string" && body.nextCursor ? body.nextCursor : null;
  const completed = body.completed === true;
  const scrolls = parseNonNegativeInteger(body.scrolls);

  if (!sessionId || !uploadToken) return jsonError("sessionId and uploadToken are required");
  if (!posts) return jsonError("posts must be an array of 100 or fewer valid Reddit posts");

  const session = await prisma.extensionIngestSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      redditUsername: true,
      crawlMode: true,
      uploadTokenHash: true,
      status: true,
      pagesScanned: true,
    },
  });

  if (!session) return jsonError("Unknown ingest session", 404);
  if (!verifyUploadToken(uploadToken, session.uploadTokenHash)) return jsonError("Invalid upload token", 401);

  if (session.status !== "running") {
    if (session.status === "completed" && completed) {
      const completedSession = await prisma.extensionIngestSession.findUnique({
        where: { id: session.id },
        select: {
          id: true,
          status: true,
          crawlMode: true,
          sourceUrl: true,
          pagesScanned: true,
          postsReceived: true,
          lastCursor: true,
          updatedAt: true,
          completedAt: true,
        },
      });

      return jsonResponse({ accepted: 0, session: completedSession });
    }

    return jsonError(`Session is ${session.status}`, 409);
  }

  let accepted = 0;

  for (const post of posts) {
    if (shouldRejectPostForSession(session, post)) continue;

    const dgwPost = await upsertExtensionPost(post, session.id);

    if (post.subreddit.toLowerCase() === "daresgonewild") {
      await createCompletionsForPost(toRedditPost(post), prisma, dgwPost.id);
    }

    accepted++;
  }

  if (session.crawlMode === "profile") {
    await prisma.dgwUser.update({
      where: { username: session.redditUsername },
      data: {
        syncStatus: completed ? "fresh" : "syncing",
        lastSyncedAt: completed ? new Date() : undefined,
      },
    }).catch(() => undefined);
  }

  const updateData: Prisma.ExtensionIngestSessionUpdateInput = {
    postsReceived: { increment: accepted },
    lastCursor: nextCursor,
    status: completed ? "completed" : "running",
    completedAt: completed ? new Date() : undefined,
  };

  if (scrolls !== null) {
    updateData.pagesScanned = Math.max(session.pagesScanned, scrolls);
  } else if (completed) {
    updateData.pagesScanned = { increment: 1 };
  }

  const updatedSession = await prisma.extensionIngestSession.update({
    where: { id: session.id },
    data: updateData,
    select: {
      id: true,
      status: true,
      crawlMode: true,
      sourceUrl: true,
      pagesScanned: true,
      postsReceived: true,
      lastCursor: true,
      updatedAt: true,
      completedAt: true,
    },
  });

  return jsonResponse({ accepted, session: updatedSession });
}

function shouldRejectPostForSession(
  session: { crawlMode: string; redditUsername: string },
  post: ExtensionRedditPost,
) {
  if (session.crawlMode !== "profile") return false;
  return post.author.toLowerCase() !== session.redditUsername.toLowerCase();
}

async function upsertExtensionPost(post: ExtensionRedditPost, sessionId: string) {
  const createdAtReddit = new Date(post.created_utc * 1000);
  const rawJson = post.rawJson === undefined ? undefined : (post.rawJson as Prisma.InputJsonValue);

  await prisma.dgwUser.upsert({
    where: { username: post.author },
    update: {},
    create: { username: post.author },
  });

  return prisma.dgwPost.upsert({
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
      source: "extension-stream",
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
      source: "extension-stream",
      ingestSessionId: sessionId,
      createdAtReddit,
      lastSeenAt: new Date(),
    },
    select: { id: true },
  });
}

function toRedditPost(post: ExtensionRedditPost): RedditPost {
  return {
    id: post.id,
    name: post.name,
    subreddit: post.subreddit,
    title: post.title,
    selftext: post.selftext ?? "",
    author: post.author,
    link_flair_text: post.link_flair_text ?? null,
    score: post.score ?? 0,
    upvoteCount: post.upvoteCount ?? null,
    upvote_ratio: post.upvote_ratio ?? null,
    num_comments: post.num_comments ?? 0,
    shareCount: post.shareCount ?? null,
    crosspostCount: post.crosspostCount ?? 0,
    mediaUrls: post.mediaUrls ?? [],
    imageUrls: post.imageUrls ?? [],
    outboundUrl: post.outboundUrl ?? null,
    thumbnailUrl: post.thumbnailUrl ?? null,
    permalink: post.permalink,
    created_utc: post.created_utc,
  };
}

function parseNonNegativeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const next = Math.floor(value);
  return next >= 0 ? next : null;
}
