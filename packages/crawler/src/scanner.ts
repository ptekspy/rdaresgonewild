import { prisma } from "@rdgw/database";
import { RedditClient } from "./reddit.js";
import { processPost } from "./detector.js";

const DEFAULT_MAX_PAGES = 50; // safety cap per scan run

function getMaxPages() {
  const maxPages = Number.parseInt(process.env.CRAWLER_MAX_PAGES ?? "", 10);
  return Number.isFinite(maxPages) && maxPages > 0 ? maxPages : DEFAULT_MAX_PAGES;
}

/**
 * Scan r/daresgonewild/new, starting from the stored cursor.
 * Stops when we hit a post we've already seen or reach MAX_PAGES.
 */
export async function scanSubreddit(client: RedditClient): Promise<void> {
  const crawlRun = await prisma.crawlRun.create({
    data: { type: "subreddit_new", target: "daresgonewild" },
  });

  const cursorRecord = await prisma.crawlCursor.findUnique({
    where: { type: "subreddit_new" },
  });

  console.log(`[scanner] subreddit scan started (run ${crawlRun.id})`);

  let after: string | undefined = undefined;
  let pagesScanned = 0;
  let postsFound = 0;
  let reachedKnown = false;
  const maxPages = getMaxPages();

  try {
    while (pagesScanned < maxPages && !reachedKnown) {
      const { posts, after: nextAfter } = await client.fetchSubredditNew(after);
      pagesScanned++;

      if (posts.length === 0) break;

      for (const post of posts) {
        // If we stored a cursor and this post is older, we've caught up
        if (cursorRecord?.lastCursor) {
          const existing = await prisma.dgwPost.findUnique({
            where: { redditId: post.id },
          });
          if (existing) {
            reachedKnown = true;
            break;
          }
        }

        await processPost(post, prisma, crawlRun.id);
        postsFound++;
      }

      await prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: { pagesScanned, postsFound },
      });

      if (!nextAfter) break;
      after = nextAfter;
    }

    // Save cursor (the first/newest post we saw)
    if (pagesScanned > 0) {
      const firstPage = await client.fetchSubredditNew(undefined);
      if (firstPage.posts[0]) {
        await prisma.crawlCursor.upsert({
          where: { type: "subreddit_new" },
          update: { lastCursor: firstPage.posts[0].name, lastRunAt: new Date() },
          create: { type: "subreddit_new", lastCursor: firstPage.posts[0].name },
        });
      }
    }

    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: { status: "completed", completedAt: new Date(), pagesScanned, postsFound },
    });

    console.log(`[scanner] done — ${postsFound} posts processed in ${pagesScanned} pages`);
  } catch (err) {
    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: { status: "failed", completedAt: new Date(), error: String(err) },
    });
    throw err;
  }
}
