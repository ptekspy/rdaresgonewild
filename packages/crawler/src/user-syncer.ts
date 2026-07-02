import { prisma } from "@rdgw/database";
import { RedditClient } from "./reddit.js";
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
  if (age > STALE_MS) return "never"; // treat very old syncs as never
  if (age > FRESH_MS) return "stale";
  return "fresh";
}

/**
 * Sync a user's r/daresgonewild posts.
 *
 * mode:
 *   "full"        — fetch all pages (first-time users)
 *   "incremental" — stop when we reach posts older than lastSyncedAt
 *   "auto"        — chooses based on user's sync status
 */
export async function syncUser(
  username: string,
  client: RedditClient,
  mode: SyncMode = "auto"
): Promise<{ postsProcessed: number; completionsFound: number }> {
  // Upsert user record
  let user = await prisma.dgwUser.upsert({
    where: { username },
    update: {},
    create: { username },
  });

  const status = getUserSyncStatus(user);
  const resolvedMode: "full" | "incremental" =
    mode === "auto" ? (status === "never" ? "full" : "incremental") : mode;

  // Mark as syncing
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
  let postsFound = 0;
  let completionsFound = 0;
  let reachedOld = false;
  const maxPages = getMaxPages();

  const cutoff = user.lastSyncedAt ? user.lastSyncedAt.getTime() : 0;

  try {
    while (pagesScanned < maxPages && !reachedOld) {
      const { posts, after: nextAfter } = await client.fetchUserSubmitted(username, after);
      pagesScanned++;

      if (posts.length === 0) break;

      for (const post of posts) {
        if (resolvedMode === "incremental" && post.created_utc * 1000 <= cutoff) {
          reachedOld = true;
          break;
        }
        const newCompletions = await processPost(post, prisma, crawlRun.id);
        postsFound++;
        completionsFound += newCompletions;
      }

      if (!nextAfter) break;
      after = nextAfter;
    }

    // Mark fresh
    await prisma.dgwUser.update({
      where: { username },
      data: { syncStatus: "fresh", lastSyncedAt: new Date(), postCount: postsFound },
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
      `[user-syncer] done u/${username} — ${postsFound} posts, ${completionsFound} completions`
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
