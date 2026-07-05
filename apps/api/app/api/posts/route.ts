import { prisma, Prisma } from "@rdgw/database";
import { type NextRequest } from "next/server";

import { jsonError, jsonResponse, optionsResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SortOrder = "asc" | "desc";

const SORT_FIELDS = {
  created: "createdAtReddit",
  createdAt: "createdAtReddit",
  createdAtReddit: "createdAtReddit",
  crawled: "crawledAt",
  crawledAt: "crawledAt",
  updated: "updatedAt",
  updatedAt: "updatedAt",
  score: "score",
  likes: "upvoteCount",
  upvotes: "upvoteCount",
  upvoteCount: "upvoteCount",
  comments: "commentCount",
  commentCount: "commentCount",
  title: "title",
  author: "authorUsername",
  authorUsername: "authorUsername",
  subreddit: "subreddit",
  flair: "flair",
} as const satisfies Record<string, keyof Prisma.DgwPostOrderByWithRelationInput>;

class BadRequestError extends Error {}

function parseCsvParam(searchParams: URLSearchParams, name: string) {
  return searchParams
    .getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function normaliseSubreddit(value: string) {
  return value.replace(/^r\//i, "").trim();
}

function readIntParam(searchParams: URLSearchParams, name: string, fallback: number, min: number, max: number) {
  const raw = searchParams.get(name);
  if (raw === null || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BadRequestError(`${name} must be an integer between ${min} and ${max}`);
  }

  return value;
}

function readOptionalIntParam(searchParams: URLSearchParams, name: string) {
  const raw = searchParams.get(name);
  if (raw === null || raw.trim() === "") return undefined;

  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new BadRequestError(`${name} must be an integer`);
  }

  return value;
}

function readDateParam(searchParams: URLSearchParams, name: string) {
  const raw = searchParams.get(name);
  if (!raw) return undefined;

  const date = new Date(raw);
  if (Number.isNaN(date.valueOf())) {
    throw new BadRequestError(`${name} must be a valid date`);
  }

  return date;
}

function readBooleanParam(searchParams: URLSearchParams, name: string) {
  const raw = searchParams.get(name);
  if (raw === null || raw.trim() === "") return undefined;

  switch (raw.toLowerCase()) {
    case "1":
    case "true":
    case "yes":
      return true;
    case "0":
    case "false":
    case "no":
      return false;
    default:
      throw new BadRequestError(`${name} must be true or false`);
  }
}

function addStringInFilter(
  where: Prisma.DgwPostWhereInput,
  field: "authorUsername" | "flair" | "source" | "subreddit",
  values: string[],
) {
  if (values.length === 0) return;

  (where as Record<string, unknown>)[field] = values.length === 1 ? values[0] : { in: values };
}

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const page = readIntParam(searchParams, "page", 1, 1, 100_000);
    const pageSize = readIntParam(searchParams, "pageSize", readIntParam(searchParams, "limit", 50, 1, 250), 1, 250);
    const skip = (page - 1) * pageSize;
    const compact = readBooleanParam(searchParams, "compact") ?? false;

    const sort = searchParams.get("sort") ?? searchParams.get("sortBy") ?? "created";
    if (!(sort in SORT_FIELDS)) {
      throw new BadRequestError(`sort must be one of: ${Object.keys(SORT_FIELDS).join(", ")}`);
    }

    const orderParam = (searchParams.get("order") ?? searchParams.get("direction") ?? "desc").toLowerCase();
    if (orderParam !== "asc" && orderParam !== "desc") {
      throw new BadRequestError("order must be asc or desc");
    }
    const order = orderParam as SortOrder;

    const where: Prisma.DgwPostWhereInput = {};
    const andFilters: Prisma.DgwPostWhereInput[] = [];

    const subreddits = parseCsvParam(searchParams, "subreddit").map(normaliseSubreddit);
    addStringInFilter(where, "subreddit", subreddits);

    const authors = parseCsvParam(searchParams, "author");
    const flairs = parseCsvParam(searchParams, "flair");
    const sources = parseCsvParam(searchParams, "source");

    addStringInFilter(where, "authorUsername", authors);
    addStringInFilter(where, "flair", flairs);
    addStringInFilter(where, "source", sources);

    const q = searchParams.get("q")?.trim();
    if (q) {
      andFilters.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { selftext: { contains: q, mode: "insensitive" } },
          { authorUsername: { contains: q, mode: "insensitive" } },
          { flair: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    const from = readDateParam(searchParams, "from") ?? readDateParam(searchParams, "createdAfter");
    const to = readDateParam(searchParams, "to") ?? readDateParam(searchParams, "createdBefore");
    if (from || to) {
      andFilters.push({ createdAtReddit: { gte: from, lte: to } });
    }

    const minScore = readOptionalIntParam(searchParams, "minScore");
    const maxScore = readOptionalIntParam(searchParams, "maxScore");
    if (minScore !== undefined || maxScore !== undefined) {
      andFilters.push({ score: { gte: minScore, lte: maxScore } });
    }

    const minLikes = readOptionalIntParam(searchParams, "minLikes") ?? readOptionalIntParam(searchParams, "minUpvotes");
    const maxLikes = readOptionalIntParam(searchParams, "maxLikes") ?? readOptionalIntParam(searchParams, "maxUpvotes");
    if (minLikes !== undefined || maxLikes !== undefined) {
      andFilters.push({ upvoteCount: { gte: minLikes, lte: maxLikes } });
    }

    const minComments = readOptionalIntParam(searchParams, "minComments");
    const maxComments = readOptionalIntParam(searchParams, "maxComments");
    if (minComments !== undefined || maxComments !== undefined) {
      andFilters.push({ commentCount: { gte: minComments, lte: maxComments } });
    }

    const hasMedia = readBooleanParam(searchParams, "hasMedia");
    if (hasMedia === true) {
      andFilters.push({
        OR: [{ mediaUrls: { isEmpty: false } }, { imageUrls: { isEmpty: false } }, { outboundUrl: { not: null } }],
      });
    }
    if (hasMedia === false) {
      andFilters.push({ mediaUrls: { isEmpty: true }, imageUrls: { isEmpty: true }, outboundUrl: null });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const sortField = SORT_FIELDS[sort as keyof typeof SORT_FIELDS];
    const orderBy: Prisma.DgwPostOrderByWithRelationInput[] = [
      { [sortField]: order } as Prisma.DgwPostOrderByWithRelationInput,
      { id: "asc" },
    ];

    const [total, posts] = await prisma.$transaction([
      prisma.dgwPost.count({ where }),
      prisma.dgwPost.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
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
          source: true,
          createdAtReddit: true,
          crawledAt: true,
          lastSeenAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return jsonResponse({
      data: posts.map((post) => {
        const compactPost = {
          redditId: post.redditId,
          subreddit: post.subreddit,
          authorUsername: post.authorUsername,
          title: post.title,
          score: post.score,
          likes: post.upvoteCount ?? post.score,
          commentCount: post.commentCount,
          upvoteRatio: post.upvoteRatio,
          redditUrl: post.permalink.startsWith("http") ? post.permalink : `https://www.reddit.com${post.permalink}`,
          thumbnailUrl: post.thumbnailUrl,
          createdAtReddit: post.createdAtReddit.toISOString(),
        };

        if (compact) return compactPost;

        return {
          ...post,
          likes: compactPost.likes,
          redditUrl: compactPost.redditUrl,
        };
      }),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: skip + posts.length < total,
        hasPreviousPage: page > 1,
        sort,
        order,
        compact,
        filters: {
          subreddit: subreddits,
          author: authors,
          flair: flairs,
          source: sources,
          q,
          from: from?.toISOString(),
          to: to?.toISOString(),
          minScore,
          maxScore,
          minLikes,
          maxLikes,
          minComments,
          maxComments,
          hasMedia,
        },
      },
    });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return jsonError(error.message, 400);
    }

    console.error("Failed to load posts", error);
    return jsonError("Failed to load posts", 500);
  }
}
