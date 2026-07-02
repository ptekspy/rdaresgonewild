import { prisma } from "@rdgw/database";
import type { RedditListingClient } from "./reddit.js";
import { processPost } from "./detector.js";

const FRESH_MS = 60 * 60 * 1000;          // 1 hour
const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_MAX_PAGES = 100;

function getMaxPages() {
  const maxPages = Number.parseInt(process.env.CRAWLER_MAX_PAGES ?? "", 10);
  return Number.isFinite(maxPages) && maxPages > 0 ? maxPages : DEFAULT_MAX_PAGES;
}

export type SyncMode = "auto" | "full" | "incremental";

export type SyncStatus = "fresh" | "stale" | "never";

export function getUserSyncStatus(user: {
  syncStatus: string;
  lastSyncedAt: Date | null;
}): SyncStatus {
  if (user.syncStatus === "never" || !user.lastSyncedAt) return "never";
  const age = Date.now() - user.lastSyncedAt.getTime();
  if (age > STALE_MS) return "never";
  if (age > FRESH_MS) return "stale";
  return "fresh";
}

export async function syncUser(
  username: string,
  client: RedditListingClient,
  mode: SyncMode = "auto"
): Promise<{ postsProcessed: number; completionsFound: number }> {
  let user = await prisma.dgwUser.upsert({
    where: { username },
    update: {},
    create: { username },
  });

  const status = getUserSyncStatus(user);
  const resolvedMode: "full" | "incremental" =
    mode === "auto" ? (status === "never" ? "full" : "incremental") : mode;

  user = await prisma.dgwUser.update({
    where: { username },
    data: { syncStatus: "syncing" },
  });

  const crawlRun = await prisma.crawlRun.create({
    data: {
      type: resolvedMode === "full" ? "user_full" : "user_incremental",
      target: username,
    },
  });

  console.log(`[user-syncer] ${resolvedMode} sync for u/${username} (run ${crawlRun.id})`);

  let after: string | undefined = undefined;
  let pagesScanned = 0;
  let rawPostsSeen = 0;
  let postsFound = 0;
  let completionsFound = 0;
  let reachedOld = false;
  let exhausted = false;

  const maxPages = getMaxPages();
  const cutoff = user.lastSyncedAt ? user.lastSyncedAt.getTime() : 0;

  try {
    while (pagesScanned < maxPages && !reachedOld) {
      const page = await client.fetchUserSubmitted(username, after);
      const { posts, after: nextAfter, rawCount, matchedCount } = page;

      pagesScanned++;
      rawPostsSeen += rawCount;

      console.log(
        `[user-syncer] page ${pagesScanned}/${maxPages} u/${username}; ` +
          `raw=${rawCount}; matches=${matchedCount}; processed=${postsFound}; ` +
          `next=${nextAfter ?? "none"}`
      );

      /**
       * Important:
       * posts is already filtered to the target subreddit.
       *
       * An empty filtered page does NOT mean Reddit is exhausted.
       * It can simply mean this user's latest 100 submitted posts were in other subreddits.
       *
       * Only stop when Reddit gives us no next cursor.
       */
      if (posts.length === 0) {
        if (!nextAfter) {
          exhausted = true;
          break;
        }

        after = nextAfter;
        continue;
      }

      for (const post of posts) {
        if (resolvedMode === "incremental" && post.created_utc * 1000 <= cutoff) {
          reachedOld = true;
          break;
        }

        const newCompletions = await processPost(post, prisma, crawlRun.id);
        postsFound++;
        completionsFound += newCompletions;
      }

      await prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: {
          pagesScanned,
          postsFound,
          completionsDetected: completionsFound,
        },
      });

      if (reachedOld) break;

      if (!nextAfter) {
        exhausted = true;
        break;
      }

      after = nextAfter;
    }

    await prisma.dgwUser.update({
      where: { username },
      data: { syncStatus: "fresh", lastSyncedAt: new Date() },
    });

    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        pagesScanned,
        postsFound,
        completionsDetected: completionsFound,
      },
    });

    console.log(
      `[user-syncer] done u/${username} — ` +
        `${postsFound} matching posts, ${completionsFound} completions, ` +
        `${rawPostsSeen} raw posts seen, ${pagesScanned} pages, ` +
        `exhausted=${exhausted}, reachedOld=${reachedOld}`
    );

    return { postsProcessed: postsFound, completionsFound };
  } catch (err) {
    await prisma.dgwUser.update({
      where: { username },
      data: { syncStatus: "stale" },
    });

    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: { status: "failed", completedAt: new Date(), error: String(err) },
    });

    throw err;
  }
}