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
import { importHtmlString, parseDaresGoneWildHtml } from "../html-importer.js";
import { loadEnvFiles } from "./env.js";

loadEnvFiles();

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
  console.log(`[crawler-bot] running ${job.type}:${job.target} -> ${job.url}`);

  await browser.navigate(job.url);
  const capture = await browser.scrollAndCapture({
    waitMs: config.scrollWaitMs,
    stableRounds: config.scrollStableRounds,
    maxScrolls: config.maxScrollsPerPage,
    shouldStop:
      job.type === "subreddit_new_hourly"
        ? async (postNames) => hasKnownPost(postNames)
        : undefined,
  });

  const result = await importHtmlString(capture.html, {
    target: job.target,
    crawlRunType: `browser_${job.type}`,
    subreddit: config.subreddit,
  });

  for (const author of result.authors) {
    await queueUserJob(author);
  }

  if (job.type === "user_full_scroll") {
    await prisma.dgwUser.update({
      where: { username: job.target },
      data: { syncStatus: "fresh", lastSyncedAt: new Date() },
    });
  }

  if (job.type === "subreddit_new_hourly") {
    const firstPost = parseDaresGoneWildHtml(capture.html)[0];
    if (firstPost?.name) {
      await prisma.crawlCursor.upsert({
        where: { type: "subreddit_new" },
        update: { lastCursor: firstPost.name, lastRunAt: new Date() },
        create: { type: "subreddit_new", lastCursor: firstPost.name },
      });
    }
  }

  console.log(
    `[crawler-bot] completed ${job.type}:${job.target}; posts=${result.postsProcessed}; ` +
      `completions=${result.completionsFound}; scrolls=${capture.scrolls}; ` +
      `seen=${capture.postsSeen}; exhausted=${capture.exhausted}; stoppedAtKnown=${capture.stoppedAtKnown}`,
  );
}

async function hasKnownPost(postNames: string[]) {
  const redditIds = postNames
    .filter((name): name is string => Boolean(name?.startsWith("t3_")))
    .map((name) => name.slice(3));

  if (redditIds.length === 0) return false;

  const known = await prisma.dgwPost.findFirst({
    where: { redditId: { in: redditIds } },
    select: { id: true },
  });

  return Boolean(known);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
