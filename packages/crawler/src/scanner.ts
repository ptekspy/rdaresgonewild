import { prisma } from "@rdgw/database";
import type { RedditListingClient } from "./reddit.js";
import { processPost } from "./detector.js";

const DEFAULT_MAX_PAGES = 25;
const DEFAULT_BACKFILL_MAX_PAGES = 1_000;

function getPositiveInteger(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Incremental scan of r/daresgonewild/new.
 * This is the normal live worker path. It starts from the newest page and stops
 * once it reaches a post that is already in the DB.
 */
export async function scanSubreddit(client: RedditListingClient): Promise<void> {
  const target = client.targetSubreddit;
  const crawlRun = await prisma.crawlRun.create({
    data: { type: "subreddit_new", target },
  });

  console.log(`[scanner] subreddit scan started (run ${crawlRun.id}, target r/${target})`);

  let after: string | undefined;
  let firstSeenCursor: string | null = null;
  let pagesScanned = 0;
  let postsFound = 0;
  let completionsDetected = 0;
  let reachedKnown = false;

  const maxPages = getPositiveInteger("CRAWLER_MAX_PAGES", DEFAULT_MAX_PAGES);

  try {
    while (pagesScanned < maxPages && !reachedKnown) {
      const { posts, after: nextAfter } = await client.fetchSubredditNew(after);
      pagesScanned++;

      if (!firstSeenCursor && posts[0]?.name) {
        firstSeenCursor = posts[0].name;
      }

      if (posts.length === 0) break;

      for (const post of posts) {
        const existing = await prisma.dgwPost.findFirst({
          where: { subreddit: target, redditId: post.id },
          select: { id: true },
        });

        if (existing) {
          reachedKnown = true;
          break;
        }

        completionsDetected += await processPost(post, prisma, crawlRun.id);
        postsFound++;
      }

      await prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: { pagesScanned, postsFound, completionsDetected },
      });

      if (!nextAfter) break;
      after = nextAfter;
    }

    if (firstSeenCursor) {
      await prisma.crawlCursor.upsert({
        where: { type_target: { type: "subreddit_new", target } },
        update: { lastCursor: firstSeenCursor, lastRunAt: new Date() },
        create: { type: "subreddit_new", target, lastCursor: firstSeenCursor },
      });
    }

    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        pagesScanned,
        postsFound,
        completionsDetected,
      },
    });

    console.log(
      `[scanner] done — ${postsFound} new posts, ${completionsDetected} completions, ` +
        `${pagesScanned} pages${reachedKnown ? " (caught up)" : ""}`
    );
  } catch (err) {
    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: { status: "failed", completedAt: new Date(), error: String(err) },
    });
    throw err;
  }
}

/**
 * Backfill r/daresgonewild/new as far as Reddit's listing endpoint will allow.
 * This does not stop on known posts, so it is safe to run after manual imports
 * or partial scans.
 */
export async function backfillSubredditNew(client: RedditListingClient): Promise<void> {
  const target = client.targetSubreddit;
  const crawlRun = await prisma.crawlRun.create({
    data: { type: "subreddit_new_backfill", target },
  });

  console.log(`[backfill] started (run ${crawlRun.id}, target r/${target})`);

  let after: string | undefined;
  let firstSeenCursor: string | null = null;
  let pagesScanned = 0;
  let postsFound = 0;
  let completionsDetected = 0;

  const maxPages = getPositiveInteger("CRAWLER_BACKFILL_MAX_PAGES", DEFAULT_BACKFILL_MAX_PAGES);

  try {
    while (pagesScanned < maxPages) {
      const { posts, after: nextAfter } = await client.fetchSubredditNew(after);
      pagesScanned++;

      if (!firstSeenCursor && posts[0]?.name) {
        firstSeenCursor = posts[0].name;
      }

      if (posts.length === 0) break;

      for (const post of posts) {
        completionsDetected += await processPost(post, prisma, crawlRun.id);
        postsFound++;
      }

      await prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: { pagesScanned, postsFound, completionsDetected },
      });

      console.log(
        `[backfill] page ${pagesScanned}; processed=${postsFound}; completions=${completionsDetected}; next=${nextAfter ?? "none"}`
      );

      if (!nextAfter) break;
      after = nextAfter;
    }

    if (firstSeenCursor) {
      await prisma.crawlCursor.upsert({
        where: { type_target: { type: "subreddit_new", target } },
        update: { lastCursor: firstSeenCursor, lastRunAt: new Date() },
        create: { type: "subreddit_new", target, lastCursor: firstSeenCursor },
      });
    }

    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        pagesScanned,
        postsFound,
        completionsDetected,
      },
    });

    console.log(
      `[backfill] done — ${postsFound} posts processed, ${completionsDetected} completions, ${pagesScanned} pages`
    );
  } catch (err) {
    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: { status: "failed", completedAt: new Date(), error: String(err) },
    });
    throw err;
  }
}
