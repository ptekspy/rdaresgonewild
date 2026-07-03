import { Prisma, prisma, type BrowserCrawlJob } from "@rdgw/database";

export type BrowserCrawlJobType = "subreddit_new_hourly" | "subreddit_sort_daily" | "user_full_scroll";
export type SubredditTopTimeWindow = "day" | "week" | "month" | "year" | "all";

type SubredditCrawlJobType = Exclude<BrowserCrawlJobType, "user_full_scroll">;

export interface SubredditJobDefinition {
  type: SubredditCrawlJobType;
  target: string;
  url: string;
  priority: number;
  forceFullScan?: boolean;
}

const JOB_LEASE_MS = 30 * 60 * 1000;
const DEFAULT_TOP_TIME_WINDOWS: SubredditTopTimeWindow[] = ["day", "week", "month", "year", "all"];
const TOP_TIME_WINDOWS = new Set<SubredditTopTimeWindow>(DEFAULT_TOP_TIME_WINDOWS);
const PROCESS_STARTED_AT = new Date();

let startupSubredditBootstrapQueued = false;

export function getIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getBooleanEnv(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(value)) return true;
  if (["0", "false", "no", "n", "off"].includes(value)) return false;

  return fallback;
}

export function getTopTimeWindowsEnv(name = "CRAWLER_TOP_TIME_WINDOWS") {
  const configured = process.env[name]
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!configured || configured.length === 0) return DEFAULT_TOP_TIME_WINDOWS;

  const windows = configured.filter((value): value is SubredditTopTimeWindow =>
    TOP_TIME_WINDOWS.has(value as SubredditTopTimeWindow),
  );

  return windows.length > 0 ? [...new Set(windows)] : DEFAULT_TOP_TIME_WINDOWS;
}

export function getBotConfig() {
  const subreddit = process.env.REDDIT_SUBREDDIT ?? "daresgonewild";

  return {
    subreddit,
    newIntervalMs: getIntegerEnv("CRAWLER_NEW_INTERVAL_MS", 60 * 60 * 1000),
    dailySortIntervalMs: getIntegerEnv("CRAWLER_DAILY_SORT_INTERVAL_MS", 24 * 60 * 60 * 1000),
    userRecrawlMs: getIntegerEnv("CRAWLER_USER_RECRAWL_MS", 24 * 60 * 60 * 1000),
    idleSleepMs: getIntegerEnv("CRAWLER_IDLE_SLEEP_MS", 60 * 1000),
    maxPages: getIntegerEnv("CRAWLER_MAX_PAGES", 25),
    backfillMaxPages: getIntegerEnv("CRAWLER_BACKFILL_MAX_PAGES", 1000),
    topTimeWindows: getTopTimeWindowsEnv(),
    subredditBootstrapOnStart: getBooleanEnv("CRAWLER_SUBREDDIT_BOOTSTRAP_ON_START", false),
    htmlDiagnostics: getBooleanEnv("CRAWLER_HTML_DIAGNOSTICS", false),
  };
}

export async function recoverExpiredJobs() {
  await prisma.browserCrawlJob.updateMany({
    where: {
      status: "running",
      OR: [
        { leaseUntil: { lt: new Date() } },
        { startedAt: { lt: PROCESS_STARTED_AT } },
      ],
    },
    data: {
      status: "queued",
      leaseUntil: null,
      startedAt: null,
      lastError: "Recovered after expired lease",
    },
  });
}

export async function ensureDueJobs() {
  const config = getBotConfig();
  const now = new Date();
  const subredditJobs = getSubredditJobDefinitions(config.subreddit, config.topTimeWindows);

  for (const job of subredditJobs) {
    await ensureRecurringJob({
      ...job,
      intervalMs: job.type === "subreddit_new_hourly" ? config.newIntervalMs : config.dailySortIntervalMs,
    });
  }

  if (config.subredditBootstrapOnStart && !startupSubredditBootstrapQueued) {
    startupSubredditBootstrapQueued = true;
    await scheduleStartupSubredditBootstrap(subredditJobs);
  }

  if (await hasDueSubredditJob()) {
    return;
  }

  const cutoff = new Date(now.getTime() - config.userRecrawlMs);

  const users = await prisma.dgwUser.findMany({
    where: {
      posts: { some: { subreddit: config.subreddit } },
      OR: [
        { lastSyncedAt: null },
        { lastSyncedAt: { lt: cutoff } },
        { syncStatus: { in: ["never", "stale"] } },
      ],
    },
    orderBy: [{ lastSyncedAt: "asc" }, { updatedAt: "asc" }],
    take: 100,
    select: { username: true },
  });

  for (const user of users) {
    await queueUserJob(user.username, now, config.subreddit);
  }
}

export function getSubredditJobDefinitions(
  subreddit: string,
  topTimeWindows = DEFAULT_TOP_TIME_WINDOWS,
): SubredditJobDefinition[] {
  const base = `https://www.reddit.com/r/${subreddit}`;
  const jobs: SubredditJobDefinition[] = [
    {
      type: "subreddit_new_hourly",
      target: subreddit,
      url: `${base}/new/`,
      priority: 100,
    },
    {
      type: "subreddit_sort_daily",
      target: `${subreddit}:best`,
      url: `${base}/best/`,
      priority: 80,
    },
    {
      type: "subreddit_sort_daily",
      target: `${subreddit}:hot`,
      url: `${base}/hot/`,
      priority: 80,
    },
  ];

  for (const window of topTimeWindows) {
    jobs.push({
      type: "subreddit_sort_daily",
      target: `${subreddit}:top_${window}`,
      url: `${base}/top/?t=${window}`,
      priority: 80,
    });
  }

  return jobs;
}

async function scheduleStartupSubredditBootstrap(jobs: SubredditJobDefinition[]) {
  const now = new Date();

  console.log(
    "[crawler-jobs] CRAWLER_SUBREDDIT_BOOTSTRAP_ON_START=true; queueing one startup subreddit pass",
  );

  for (const job of jobs) {
    await upsertJob({
      ...job,
      scheduledFor: now,
      forceReschedule: true,
      forceFullScan: true,
    });
  }
}

async function hasDueSubredditJob() {
  const now = new Date();

  const job = await prisma.browserCrawlJob.findFirst({
    where: {
      status: "queued",
      scheduledFor: { lte: now },
      type: { in: ["subreddit_new_hourly", "subreddit_sort_daily"] },
    },
    select: { id: true },
  });

  return Boolean(job);
}

export async function queueUserJob(
  username: string,
  scheduledFor = new Date(),
  subreddit = getBotConfig().subreddit,
) {
  const safeUsername = username.replace(/^u\//i, "").trim();
  if (!safeUsername || safeUsername === "[deleted]") return;
  const target = `${subreddit}:${safeUsername}`;

  await upsertJob({
    type: "user_full_scroll",
    target,
    url: `https://www.reddit.com/user/${encodeURIComponent(safeUsername)}/submitted/`,
    priority: 40,
    scheduledFor,
    forceReschedule: false,
  });
}

export async function claimNextJob() {
  const now = new Date();

  const job = await prisma.browserCrawlJob.findFirst({
    where: {
      status: "queued",
      scheduledFor: { lte: now },
    },
    orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }, { createdAt: "asc" }],
  });

  if (!job) return null;

  const claimed = await prisma.browserCrawlJob.updateMany({
    where: { id: job.id, status: "queued" },
    data: {
      status: "running",
      startedAt: now,
      leaseUntil: new Date(now.getTime() + JOB_LEASE_MS),
      attempts: { increment: 1 },
      lastError: null,
    },
  });

  if (claimed.count === 0) return null;

  return prisma.browserCrawlJob.findUniqueOrThrow({ where: { id: job.id } });
}

export async function completeJob(job: BrowserCrawlJob) {
  const now = new Date();

  const nextScheduledFor =
    job.type === "subreddit_new_hourly"
      ? new Date(now.getTime() + getBotConfig().newIntervalMs)
      : job.type === "subreddit_sort_daily"
        ? new Date(now.getTime() + getBotConfig().dailySortIntervalMs)
        : job.type === "user_full_scroll"
          ? new Date(now.getTime() + getBotConfig().userRecrawlMs)
          : now;

  await prisma.browserCrawlJob.update({
    where: { id: job.id },
    data: {
      status: "completed",
      completedAt: now,
      scheduledFor: nextScheduledFor,
      startedAt: null,
      leaseUntil: null,
      state: Prisma.JsonNull,
    },
  });
}

export async function failJob(job: BrowserCrawlJob, error: unknown) {
  const retryDelayMs = Math.min(60 * 60 * 1000, 60_000 * Math.max(1, job.attempts));

  await prisma.browserCrawlJob.update({
    where: { id: job.id },
    data: {
      status: "queued",
      startedAt: null,
      leaseUntil: null,
      scheduledFor: new Date(Date.now() + retryDelayMs),
      lastError: error instanceof Error ? error.stack ?? error.message : String(error),
    },
  });
}

async function ensureRecurringJob(input: {
  type: BrowserCrawlJobType;
  target: string;
  url: string;
  priority: number;
  intervalMs: number;
}) {
  const existing = await prisma.browserCrawlJob.findUnique({
    where: { dedupeKey: dedupeKey(input.type, input.target) },
  });

  if (!existing) {
    await upsertJob({ ...input, scheduledFor: new Date(), forceReschedule: true });
    return;
  }

  if (existing.status !== "running" && existing.scheduledFor <= new Date()) {
    await prisma.browserCrawlJob.update({
      where: { id: existing.id },
      data: {
        status: "queued",
        url: input.url,
        priority: input.priority,
        completedAt: null,
      },
    });
  }
}

async function upsertJob(input: {
  type: BrowserCrawlJobType;
  target: string;
  url: string;
  priority: number;
  scheduledFor: Date;
  forceReschedule?: boolean;
  forceFullScan?: boolean;
}) {
  const key = dedupeKey(input.type, input.target);

  const existing = await prisma.browserCrawlJob.findUnique({
    where: { dedupeKey: key },
  });

  if (existing?.status === "running") return;

  if (
    existing &&
    !input.forceReschedule &&
    existing.scheduledFor > new Date() &&
    existing.status !== "failed"
  ) {
    return;
  }

  await prisma.browserCrawlJob.upsert({
    where: { dedupeKey: key },
    update: {
      type: input.type,
      target: input.target,
      url: input.url,
      priority: input.priority,
      scheduledFor: input.scheduledFor,
      startedAt: null,
      completedAt: null,
      leaseUntil: null,
      lastError: null,
      state: input.forceFullScan ? { forceFullScan: true } : Prisma.JsonNull,
      status:
        existing?.status === "completed" || existing?.status === "failed"
          ? "queued"
          : existing?.status ?? "queued",
    },
    create: {
      dedupeKey: key,
      type: input.type,
      target: input.target,
      url: input.url,
      priority: input.priority,
      scheduledFor: input.scheduledFor,
      state: input.forceFullScan ? { forceFullScan: true } : undefined,
    },
  });
}

export function dedupeKey(type: string, target: string) {
  return `${type}:${target.toLowerCase()}`;
}
