import { Prisma } from "@prisma/client";
import { LEVEL_LABELS, PLAYBOOK_BY_SLUG } from "@rdgw/playbook";
import { getDb } from "@/lib/db";
import { hasRedgifsUrl, selectTimelinePreview } from "@/lib/timeline-media";
import { isValidUsername, normaliseUsername } from "@/lib/username";

const SUBREDDIT = "daresgonewild";
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

export type TimelineType = "all" | "playbook" | "community" | "redgifs";
export type TimelineSort = "latest" | "top";

export interface TimelineFilters {
  type: TimelineType;
  sort: TimelineSort;
  creator: string;
  darer: string;
  q: string;
  cursor: string;
  limit: number;
}

export interface TimelineItem {
  id: string;
  redditId: string;
  authorUsername: string;
  title: string;
  flair: string | null;
  score: number;
  commentCount: number;
  shareCount: number | null;
  crosspostCount: number;
  outboundUrl: string | null;
  permalink: string;
  createdAtReddit: string;
  previewUrl: string | null;
  isRedgifs: boolean;
  playbookDares: Array<{
    slug: string;
    name: string;
    emoji: string;
    levelLabel: string;
  }>;
  communityDares: Array<{
    darerUsername: string;
  }>;
}

interface TimelineCursor {
  createdAtReddit: string;
  redditId: string;
  score?: number;
}

interface RawTimelineRow {
  id: string;
  redditId: string;
  createdAtReddit: Date;
  score: number;
}

export function parseTimelineFilters(searchParams: URLSearchParams): TimelineFilters {
  const type = parseTimelineType(searchParams.get("type"));
  const sort = parseTimelineSort(searchParams.get("sort"));
  const creator = normaliseOptionalUsername(searchParams.get("creator"));
  const darer = normaliseOptionalUsername(searchParams.get("darer"));
  const q = (searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  const cursor = searchParams.get("cursor") ?? "";
  const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, requestedLimit))
    : DEFAULT_LIMIT;

  return { type, sort, creator, darer, q, cursor, limit };
}

export async function getTimelinePage(filters: TimelineFilters) {
  const db = getDb();
  const rows = await getTimelineIds(filters);
  const visibleRows = rows.slice(0, filters.limit);
  const ids = visibleRows.map((row) => row.id);

  if (ids.length === 0) {
    return { items: [] as TimelineItem[], nextCursor: null as string | null };
  }

  const posts = await db.dgwPost.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      redditId: true,
      authorUsername: true,
      title: true,
      flair: true,
      score: true,
      commentCount: true,
      shareCount: true,
      crosspostCount: true,
      mediaUrls: true,
      imageUrls: true,
      outboundUrl: true,
      thumbnailUrl: true,
      permalink: true,
      createdAtReddit: true,
      playbookCompletions: {
        where: { OR: [{ verified: true }, { verified: null }] },
        select: { dareSlug: true },
      },
      communityCompletions: {
        where: { OR: [{ verified: true }, { verified: null }] },
        select: { darerUsername: true },
      },
    },
  });

  const postsById = new Map(posts.map((post) => [post.id, post]));
  const items = ids
    .map((id) => postsById.get(id))
    .filter((post): post is NonNullable<(typeof posts)[number]> => Boolean(post))
    .map<TimelineItem>((post) => ({
      id: post.id,
      redditId: post.redditId,
      authorUsername: post.authorUsername,
      title: post.title,
      flair: post.flair,
      score: post.score,
      commentCount: post.commentCount,
      shareCount: post.shareCount,
      crosspostCount: post.crosspostCount,
      outboundUrl: post.outboundUrl,
      permalink: post.permalink,
      createdAtReddit: post.createdAtReddit.toISOString(),
      previewUrl: selectTimelinePreview({
        thumbnailUrl: post.thumbnailUrl,
        imageUrls: post.imageUrls,
        mediaUrls: post.mediaUrls,
        outboundUrl: post.outboundUrl,
      }),
      isRedgifs: hasRedgifsUrl(post.outboundUrl, post.mediaUrls),
      playbookDares: post.playbookCompletions.map((completion) => {
        const dare = PLAYBOOK_BY_SLUG.get(completion.dareSlug);
        return {
          slug: completion.dareSlug,
          name: dare?.name ?? completion.dareSlug,
          emoji: dare?.emoji ?? "✓",
          levelLabel: dare ? LEVEL_LABELS[dare.level] : "Playbook",
        };
      }),
      communityDares: post.communityCompletions.map((completion) => ({
        darerUsername: completion.darerUsername,
      })),
    }));

  const lastRow = visibleRows.at(-1);
  const nextCursor = rows.length > filters.limit && lastRow ? encodeCursor(lastRow, filters.sort) : null;

  return { items, nextCursor };
}

function parseTimelineType(value: string | null): TimelineType {
  if (value === "playbook" || value === "community" || value === "redgifs") return value;
  return "all";
}

function parseTimelineSort(value: string | null): TimelineSort {
  return value === "top" ? "top" : "latest";
}

function normaliseOptionalUsername(value: string | null) {
  if (!value) return "";
  const username = normaliseUsername(value);
  return isValidUsername(username) ? username : "";
}

async function getTimelineIds(filters: TimelineFilters) {
  const db = getDb();
  const cursor = decodeCursor(filters.cursor);
  const take = filters.limit + 1;
  const conditions = buildTimelineConditions(filters, cursor);
  const orderBy =
    filters.sort === "top"
      ? Prisma.sql`p."score" DESC, p."createdAtReddit" DESC, p."redditId" DESC`
      : Prisma.sql`p."createdAtReddit" DESC, p."redditId" DESC`;

  return db.$queryRaw<RawTimelineRow[]>(Prisma.sql`
    SELECT p."id", p."redditId", p."createdAtReddit", p."score"
    FROM "DgwPost" p
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY ${orderBy}
    LIMIT ${take}
  `);
}

function buildTimelineConditions(filters: TimelineFilters, cursor: TimelineCursor | null) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p."permalink" ILIKE ${`%/r/${SUBREDDIT}/%`}`,
  ];

  if (filters.creator) {
    conditions.push(Prisma.sql`LOWER(p."authorUsername") = LOWER(${filters.creator})`);
  }

  if (filters.q) {
    const needle = `%${filters.q}%`;
    conditions.push(Prisma.sql`(p."title" ILIKE ${needle} OR p."selftext" ILIKE ${needle})`);
  }

  if (filters.darer) {
    conditions.push(Prisma.sql`
      EXISTS (
        SELECT 1 FROM "CommunityCompletion" cc
        WHERE cc."postId" = p."id"
          AND cc."verified" IS NOT FALSE
          AND LOWER(cc."darerUsername") = LOWER(${filters.darer})
      )
    `);
  }

  if (filters.type === "playbook") {
    conditions.push(Prisma.sql`
      EXISTS (
        SELECT 1 FROM "PlaybookCompletion" pc
        WHERE pc."postId" = p."id"
          AND pc."verified" IS NOT FALSE
      )
    `);
  }

  if (filters.type === "community") {
    conditions.push(Prisma.sql`
      EXISTS (
        SELECT 1 FROM "CommunityCompletion" cc
        WHERE cc."postId" = p."id"
          AND cc."verified" IS NOT FALSE
      )
    `);
  }

  if (filters.type === "redgifs") {
    conditions.push(redgifsSqlCondition());
  }

  if (cursor) {
    const cursorDate = new Date(cursor.createdAtReddit);
    if (filters.sort === "top" && typeof cursor.score === "number") {
      conditions.push(Prisma.sql`
        (
          p."score" < ${cursor.score}
          OR (
            p."score" = ${cursor.score}
            AND (
              p."createdAtReddit" < ${cursorDate}
              OR (p."createdAtReddit" = ${cursorDate} AND p."redditId" < ${cursor.redditId})
            )
          )
        )
      `);
    } else {
      conditions.push(Prisma.sql`
        (
          p."createdAtReddit" < ${cursorDate}
          OR (p."createdAtReddit" = ${cursorDate} AND p."redditId" < ${cursor.redditId})
        )
      `);
    }
  }

  return conditions;
}

function redgifsSqlCondition() {
  return Prisma.sql`
    (
      p."outboundUrl" ILIKE '%redgifs.com%'
      OR EXISTS (
        SELECT 1
        FROM unnest(p."mediaUrls") AS media_url
        WHERE media_url ILIKE '%redgifs.com%'
      )
    )
  `;
}

function encodeCursor(row: RawTimelineRow, sort: TimelineSort) {
  const cursor: TimelineCursor = {
    createdAtReddit: row.createdAtReddit.toISOString(),
    redditId: row.redditId,
  };

  if (sort === "top") cursor.score = row.score;

  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<TimelineCursor>;
    if (typeof parsed.createdAtReddit !== "string" || Number.isNaN(Date.parse(parsed.createdAtReddit))) return null;
    if (typeof parsed.redditId !== "string" || parsed.redditId.length === 0) return null;
    return {
      createdAtReddit: parsed.createdAtReddit,
      redditId: parsed.redditId,
      score: typeof parsed.score === "number" ? parsed.score : undefined,
    };
  } catch {
    return null;
  }
}
