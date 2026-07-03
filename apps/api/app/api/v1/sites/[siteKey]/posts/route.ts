import { Prisma, prisma } from "@rdgw/database";
import { jsonError, jsonResponse, optionsResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SITE_SUBREDDITS: Record<string, string[]> = {
  rdaresgonewild: ["daresgonewild"],
  daresgonewild: ["daresgonewild"],
  rdgw: ["daresgonewild"],
  rflashingandflaunting: ["FlashingAndFlaunting"],
  flashingandflaunting: ["FlashingAndFlaunting"],
};

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request, context: { params: Promise<{ siteKey: string }> }) {
  const { siteKey } = await context.params;
  const normalisedSiteKey = siteKey.toLowerCase();

  if (!/^[a-z0-9_-]{2,64}$/.test(normalisedSiteKey)) {
    return jsonError("Invalid site key");
  }

  const url = new URL(request.url);
  const limit = clampInt(url.searchParams.get("limit"), 1, 100, 24);
  const cursor = parseCursor(url.searchParams.get("cursor"));

  const configured = await prisma.siteSubreddit.findMany({
    where: {
      siteKey: { equals: normalisedSiteKey, mode: "insensitive" },
      enabled: true,
    },
    select: { subreddit: true },
  });

  const subreddits =
    configured.length > 0
      ? configured.map((item) => item.subreddit)
      : DEFAULT_SITE_SUBREDDITS[normalisedSiteKey] ?? [];

  if (subreddits.length === 0) {
    return jsonResponse({ items: [], nextCursor: null, siteKey: normalisedSiteKey, subreddits: [] });
  }

  const where: Prisma.DgwPostWhereInput = {
    OR: subreddits.map((subreddit) => ({ subreddit: { equals: subreddit, mode: "insensitive" } })),
    ...(cursor ? { createdAtReddit: { lt: cursor } } : {}),
  };

  const posts = await prisma.dgwPost.findMany({
    where,
    orderBy: [{ createdAtReddit: "desc" }, { redditId: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      redditId: true,
      subreddit: true,
      authorUsername: true,
      title: true,
      selftext: true,
      flair: true,
      score: true,
      upvoteCount: true,
      upvoteRatio: true,
      commentCount: true,
      shareCount: true,
      crosspostCount: true,
      mediaUrls: true,
      imageUrls: true,
      outboundUrl: true,
      thumbnailUrl: true,
      permalink: true,
      createdAtReddit: true,
      updatedAt: true,
      source: true,
    },
  });

  const visible = posts.slice(0, limit);
  const last = visible.at(-1);
  const nextCursor = posts.length > limit && last ? last.createdAtReddit.toISOString() : null;

  return jsonResponse({
    items: visible.map((post) => ({
      ...post,
      createdAtReddit: post.createdAtReddit.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    })),
    nextCursor,
    siteKey: normalisedSiteKey,
    subreddits,
  });
}

function clampInt(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseCursor(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
