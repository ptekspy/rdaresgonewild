import { prisma, type BrowserCrawlJob } from "@rdgw/database";
import { DedicatedRedditBrowser } from "../browser-bot.js";
import {
  claimNextJob,
  completeJob,
  ensureDueJobs,
  failJob,
  getBotConfig,
  queueUserJob,
  recoverExpiredJobs,
} from "../browser-crawl-jobs.js";
import { processPost } from "../detector.js";
import { normalisePost, type RawRedditPost, type RedditPost, type SubredditTopTimeWindow } from "../reddit.js";
import { loadEnvFiles } from "./env.js";

loadEnvFiles();

interface BrowserListing {
  data: {
    children: Array<{ data: RawRedditPost }>;
    after: string | null;
  };
}

interface JobRunResult {
  pagesScanned: number;
  rawPostsSeen: number;
  postsProcessed: number;
  completionsFound: number;
  authors: string[];
  exhausted: boolean;
  reachedKnown: boolean;
  renderedPostsSeen?: number;
}

let stopping = false;
let wakeWait: (() => void) | undefined;

function sleep(ms: number) {
  if (stopping) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      wakeWait = undefined;
      resolve();
    }, ms);

    wakeWait = () => {
      clearTimeout(timeout);
      wakeWait = undefined;
      resolve();
    };
  });
}

function requestStop(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  console.log(`[crawler-bot] received ${signal}; stopping after current job`);
  wakeWait?.();
}

process.once("SIGINT", requestStop);
process.once("SIGTERM", requestStop);

async function main() {
  const config = getBotConfig();
  const browser = new DedicatedRedditBrowser();

  console.log("[crawler-bot] starting always-on browser crawler", config);

  await recoverExpiredJobs();
  await browser.start(`https://www.reddit.com/r/${config.subreddit}/new/`);
  await browser.setRedditCookies(process.env.REDDIT_COOKIE ?? "");

  try {
    while (!stopping) {
      await recoverExpiredJobs();
      await ensureDueJobs();

      const job = await claimNextJob();

      if (!job) {
        console.log(`[crawler-bot] idle; sleeping ${config.idleSleepMs}ms`);
        await sleep(config.idleSleepMs);
        continue;
      }

      try {
        await runJob(browser, job);
        await completeJob(job);
      } catch (error) {
        console.error(`[crawler-bot] job failed ${job.type}:${job.target}`, error);
        await failJob(job, error);
      }
    }
  } finally {
    await browser.close();
  }
}

async function runJob(browser: DedicatedRedditBrowser, job: BrowserCrawlJob) {
  const config = getBotConfig();
  const forceFullScan = isForceFullScan(job.state);

  console.log(
    `[crawler-bot] running ${job.type}:${job.target} -> ${job.url}` +
      (forceFullScan ? " forceFullScan=true" : ""),
  );

  await browser.navigate(job.url);

  const result =
    job.type === "user_full_scroll"
      ? await runUserJob(browser, job)
      : await runSubredditJob(browser, job, forceFullScan);

  if (config.htmlDiagnostics && result.renderedPostsSeen !== undefined) {
    console.log(
      `[crawler-bot] html diagnostics ${job.type}:${job.target}; ` +
        `renderedPosts=${result.renderedPostsSeen}; jsonRaw=${result.rawPostsSeen}; ` +
        `jsonImported=${result.postsProcessed}`,
    );
  }

  if (job.type === "subreddit_new_hourly" || job.type === "subreddit_sort_daily") {
    for (const author of result.authors) {
      await queueUserJob(author, new Date(), getBotConfig().subreddit);
    }
  }

  console.log(
    `[crawler-bot] completed ${job.type}:${job.target}; posts=${result.postsProcessed}; ` +
      `completions=${result.completionsFound}; pages=${result.pagesScanned}; ` +
      `raw=${result.rawPostsSeen}; exhausted=${result.exhausted}; reachedKnown=${result.reachedKnown}`,
  );
}

async function runSubredditJob(
  browser: DedicatedRedditBrowser,
  job: BrowserCrawlJob,
  forceFullScan: boolean,
): Promise<JobRunResult> {
  const config = getBotConfig();
  const listing = parseSubredditJob(job, config.subreddit);
  const stopAtKnown = job.type === "subreddit_new_hourly" && !forceFullScan;
  const maxPages = stopAtKnown ? config.maxPages : config.backfillMaxPages;
  const crawlRun = await prisma.crawlRun.create({
    data: { type: `browser_${job.type}`, target: job.target },
  });

  const renderedPostsSeen = config.htmlDiagnostics
    ? (await browser.getVisiblePostMetrics()).postCount
    : undefined;

  let after: string | undefined;
  let firstSeenCursor: string | null = null;
  let pagesScanned = 0;
  let rawPostsSeen = 0;
  let postsProcessed = 0;
  let completionsFound = 0;
  let exhausted = false;
  let reachedKnown = false;
  const authors = new Set<string>();

  try {
    while (pagesScanned < maxPages && !reachedKnown) {
      const page = await fetchSubredditListingPage(browser, config.subreddit, listing.sort, after, listing.topTime);
      pagesScanned++;
      rawPostsSeen += page.rawCount;

      if (!firstSeenCursor && page.posts[0]?.name) {
        firstSeenCursor = page.posts[0].name;
      }

      const knownRedditIds = stopAtKnown
        ? await fetchKnownRedditIds(config.subreddit, page.posts.map((post) => post.id))
        : new Set<string>();

      for (const post of page.posts) {
        if (stopAtKnown && knownRedditIds.has(post.id)) {
          reachedKnown = true;
          break;
        }

        completionsFound += await processPost(post, prisma, crawlRun.id);
        postsProcessed++;
        authors.add(post.author);
      }

      await prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: { pagesScanned, postsFound: postsProcessed, completionsDetected: completionsFound },
      });

      console.log(
        `[crawler-bot] page ${pagesScanned}/${maxPages} ${job.type}:${job.target}; ` +
          `raw=${page.rawCount}; matches=${page.posts.length}; processed=${postsProcessed}; ` +
          `next=${page.after ?? "none"}${reachedKnown ? "; reachedKnown=true" : ""}`,
      );

      if (reachedKnown) break;
      if (!page.after) {
        exhausted = true;
        break;
      }

      after = page.after;
    }

    if (job.type === "subreddit_new_hourly" && firstSeenCursor) {
      await prisma.crawlCursor.upsert({
        where: { type_target: { type: "subreddit_new", target: config.subreddit } },
        update: { lastCursor: firstSeenCursor, lastRunAt: new Date() },
        create: { type: "subreddit_new", target: config.subreddit, lastCursor: firstSeenCursor },
      });
    }

    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        pagesScanned,
        postsFound: postsProcessed,
        completionsDetected: completionsFound,
      },
    });

    return {
      pagesScanned,
      rawPostsSeen,
      postsProcessed,
      completionsFound,
      authors: [...authors],
      exhausted,
      reachedKnown,
      renderedPostsSeen,
    };
  } catch (error) {
    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: { status: "failed", completedAt: new Date(), error: String(error) },
    });
    throw error;
  }
}

async function runUserJob(browser: DedicatedRedditBrowser, job: BrowserCrawlJob): Promise<JobRunResult> {
  const config = getBotConfig();
  const username = parseUserJobTarget(job.target, config.subreddit);
  const crawlRun = await prisma.crawlRun.create({
    data: { type: "browser_user_full_scroll", target: `${config.subreddit}:${username}` },
  });

  await prisma.dgwUser.upsert({
    where: { username },
    update: { syncStatus: "syncing" },
    create: { username, syncStatus: "syncing" },
  });

  const renderedPostsSeen = config.htmlDiagnostics
    ? (await browser.getVisiblePostMetrics()).postCount
    : undefined;

  let after: string | undefined;
  let pagesScanned = 0;
  let rawPostsSeen = 0;
  let postsProcessed = 0;
  let completionsFound = 0;
  let exhausted = false;

  try {
    while (pagesScanned < config.maxPages) {
      const page = await fetchUserSubmittedPage(browser, config.subreddit, username, after);
      pagesScanned++;
      rawPostsSeen += page.rawCount;

      for (const post of page.posts) {
        completionsFound += await processPost(post, prisma, crawlRun.id);
        postsProcessed++;
      }

      await prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: { pagesScanned, postsFound: postsProcessed, completionsDetected: completionsFound },
      });

      console.log(
        `[crawler-bot] page ${pagesScanned}/${config.maxPages} user_full_scroll:${config.subreddit}:${username}; ` +
          `raw=${page.rawCount}; matches=${page.posts.length}; processed=${postsProcessed}; ` +
          `next=${page.after ?? "none"}`,
      );

      if (!page.after) {
        exhausted = true;
        break;
      }

      after = page.after;
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
        postsFound: postsProcessed,
        completionsDetected: completionsFound,
      },
    });

    return {
      pagesScanned,
      rawPostsSeen,
      postsProcessed,
      completionsFound,
      authors: [],
      exhausted,
      reachedKnown: false,
      renderedPostsSeen,
    };
  } catch (error) {
    await prisma.dgwUser.update({
      where: { username },
      data: { syncStatus: "stale" },
    });

    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: { status: "failed", completedAt: new Date(), error: String(error) },
    });
    throw error;
  }
}

function parseUserJobTarget(target: string, subreddit: string) {
  const prefix = `${subreddit}:`;
  return target.startsWith(prefix) ? target.slice(prefix.length) : target;
}

function isForceFullScan(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as { forceFullScan?: unknown }).forceFullScan === true;
}

function parseSubredditJob(job: BrowserCrawlJob, subreddit: string) {
  if (job.type === "subreddit_new_hourly") {
    return { sort: "new" as const };
  }

  const [, suffix = "hot"] = job.target.split(":");

  if (suffix === "best") return { sort: "best" as const };
  if (suffix === "hot") return { sort: "hot" as const };

  const topTime = suffix.replace(/^top_/, "") as SubredditTopTimeWindow;
  if (["day", "week", "month", "year", "all"].includes(topTime)) {
    return { sort: "top" as const, topTime };
  }

  throw new Error(`Unsupported subreddit job target for r/${subreddit}: ${job.target}`);
}

async function fetchSubredditListingPage(
  browser: DedicatedRedditBrowser,
  subreddit: string,
  sort: "new" | "best" | "hot" | "top",
  after?: string,
  topTime?: SubredditTopTimeWindow,
) {
  const params = new URLSearchParams({ limit: "100", raw_json: "1" });
  if (after) params.set("after", after);
  if (sort === "top" && topTime) params.set("t", topTime);

  const listing = await browser.fetchRedditJson<BrowserListing>(
    `/r/${encodeURIComponent(subreddit)}/${sort}.json?${params}`,
  );

  return listingToPage(listing, subreddit);
}

async function fetchUserSubmittedPage(
  browser: DedicatedRedditBrowser,
  subreddit: string,
  username: string,
  after?: string,
) {
  const params = new URLSearchParams({ limit: "100", raw_json: "1" });
  if (after) params.set("after", after);

  const listing = await browser.fetchRedditJson<BrowserListing>(
    `/user/${encodeURIComponent(username)}/submitted.json?${params}`,
  );

  return listingToPage(listing, subreddit);
}

function listingToPage(listing: BrowserListing, subreddit: string) {
  const rawChildren = listing.data.children;
  const posts = rawChildren
    .map((child) => normalisePost(child.data))
    .filter((post): post is RedditPost => Boolean(post))
    .filter((post) => isTargetSubredditPost(post, subreddit));

  return {
    posts,
    after: listing.data.after,
    rawCount: rawChildren.length,
  };
}

function isTargetSubredditPost(post: RedditPost, subreddit: string) {
  return post.permalink.toLowerCase().includes(`/r/${subreddit.toLowerCase()}/`);
}

async function fetchKnownRedditIds(subreddit: string, redditIds: string[]) {
  if (redditIds.length === 0) return new Set<string>();

  const rows = await prisma.dgwPost.findMany({
    where: { subreddit, redditId: { in: redditIds } },
    select: { redditId: true },
  });

  return new Set(rows.map((row) => row.redditId));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
