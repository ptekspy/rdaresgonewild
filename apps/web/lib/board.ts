import { getDb } from "@/lib/db";
import { getBoardTag, getSiteConfig } from "@/lib/site";
import type { Prisma } from "@prisma/client";

export type TopWindow = "day" | "week" | "month" | "year" | "all";

export const BOARD_PAGE_SIZE = 24;

export function getTopWindowStart(window: TopWindow) {
  if (window === "all") return null;

  const days = window === "day" ? 1 : window === "week" ? 7 : window === "month" ? 31 : 365;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export function getBoardWhere(input: { tagSlug?: string; authorUsername?: string } = {}) {
  const site = getSiteConfig();
  const where: Prisma.DgwPostWhereInput = {
    subreddit: site.subreddit,
  };

  if (input.authorUsername) {
    where.authorUsername = input.authorUsername;
  }

  if (input.tagSlug) {
    const tag = getBoardTag(input.tagSlug);
    if (!tag) {
      where.id = "__missing_tag__";
      return where;
    }

    where.OR = tag.terms.flatMap((term) => [
      { title: { contains: term, mode: "insensitive" as const } },
      { flair: { contains: term, mode: "insensitive" as const } },
    ]);
  }

  return where;
}

export async function getBoardPosts(input: {
  sort?: "new" | "top";
  topWindow?: TopWindow;
  tagSlug?: string;
  authorUsername?: string;
  page?: number;
  limit?: number;
} = {}) {
  const db = getDb();
  const page = Math.max(1, input.page ?? 1);
  const limit = input.limit ?? BOARD_PAGE_SIZE;
  const where = getBoardWhere({ tagSlug: input.tagSlug, authorUsername: input.authorUsername });
  const topStart = input.sort === "top" ? getTopWindowStart(input.topWindow ?? "month") : null;

  if (topStart) {
    where.createdAtReddit = { gte: topStart };
  }

  return db.dgwPost.findMany({
    where,
    orderBy:
      input.sort === "top"
        ? [{ score: "desc" }, { commentCount: "desc" }, { createdAtReddit: "desc" }]
        : [{ createdAtReddit: "desc" }],
    skip: (page - 1) * limit,
    take: limit,
    select: {
      id: true,
      title: true,
      authorUsername: true,
      flair: true,
      score: true,
      commentCount: true,
      imageUrls: true,
      thumbnailUrl: true,
      permalink: true,
      createdAtReddit: true,
    },
  });
}

export async function getBoardStats() {
  const db = getDb();
  const site = getSiteConfig();
  const [postCount, creatorRows] = await Promise.all([
    db.dgwPost.count({ where: { subreddit: site.subreddit } }),
    db.dgwPost.groupBy({
      by: ["authorUsername"],
      where: { subreddit: site.subreddit },
      _count: { id: true },
    }),
  ]);

  return { postCount, creatorCount: creatorRows.length };
}

export async function getTopBoardCreators(limit = 12) {
  const db = getDb();
  const site = getSiteConfig();

  return db.dgwPost.groupBy({
    by: ["authorUsername"],
    where: { subreddit: site.subreddit },
    _count: { id: true },
    _sum: { score: true },
    orderBy: [{ _count: { id: "desc" } }, { _sum: { score: "desc" } }],
    take: limit,
  });
}
