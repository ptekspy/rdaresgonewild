import { prisma, type BrowserCrawlJob } from "@rdgw/database";

export type BrowserCrawlJobType = "subreddit_new_hourly" | "subreddit_sort_daily" | "user_full_scroll";

const JOB_LEASE_MS = 30 * 60 * 1000;

export function getIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getBotConfig() {
  const subreddit = process.env.REDDIT_SUBREDDIT ?? "daresgonewild";
  return {
    subreddit,
    newIntervalMs: getIntegerEnv("CRAWLER_NEW_INTERVAL_MS", 60 * 60 * 1000),
    dailySortIntervalMs: getIntegerEnv("CRAWLER_DAILY_SORT_INTERVAL_MS", 24 * 60 * 60 * 1000),
    userRecrawlMs: getIntegerEnv("CRAWLER_USER_RECRAWL_MS", 24 * 60 * 60 * 1000),
    idleSleepMs: getIntegerEnv("CRAWLER_IDLE_SLEEP_MS", 60 * 1000),
    scrollWaitMs: getIntegerEnv("CRAWLER_SCROLL_WAIT_MS", 1500),
    scrollStableRounds: getIntegerEnv("CRAWLER_SCROLL_STABLE_ROUNDS", 3),
    maxScrollsPerPage: getIntegerEnv("CRAWLER_MAX_SCROLLS_PER_PAGE", 500),
  };
}

export async function recoverExpiredJobs() {
  await prisma.browserCrawlJob.updateMany({
    where: {
      status: "running",
      leaseUntil: { lt: new Date() },
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
  const base = `https://www.reddit.com/r/${config.subreddit}`;

  await ensureRecurringJob({
    type: "subreddit_new_hourly",
    target: config.subreddit,
    url: `${base}/new/`,
    priority: 100,
    intervalMs: config.newIntervalMs,
  });

  for (const sort of [
    { target: `${config.subreddit}:best`, url: `${base}/best/` },
    { target: `${config.subreddit}:hot`, url: `${base}/hot/` },
    { target: `${config.subreddit}:top_day`, url: `${base}/top/?t=day` },
  ]) {
    await ensureRecurringJob({
      type: "subreddit_sort_daily",
      target: sort.target,
      url: sort.url,
      priority: 80,
      intervalMs: config.dailySortIntervalMs,
    });
  }

  const cutoff = new Date(now.getTime() - config.userRecrawlMs);
  const users = await prisma.dgwUser.findMany({
    where: {
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
    await queueUserJob(user.username, now);
  }
}

export async function queueUserJob(username: string, scheduledFor = new Date()) {
  const safeUsername = username.replace(/^u\//i, "").trim();
  if (!safeUsername || safeUsername === "[deleted]") return;

  await upsertJob({
    type: "user_full_scroll",
    target: safeUsername,
    url: `https://www.reddit.com/user/${encodeURIComponent(safeUsername)}/submitted/`,
    priority: 40,
    scheduledFor,
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
    await upsertJob({ ...input, scheduledFor: new Date() });
    return;
  }

  if (existing.status !== "running" && existing.scheduledFor <= new Date()) {
    await prisma.browserCrawlJob.update({
      where: { id: existing.id },
      data: {
        status: "queued",
        url: input.url,
        priority: input.priority,
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
}) {
  const key = dedupeKey(input.type, input.target);
  const existing = await prisma.browserCrawlJob.findUnique({ where: { dedupeKey: key } });

  if (existing?.status === "running") return;

  await prisma.browserCrawlJob.upsert({
    where: { dedupeKey: key },
    update: {
      url: input.url,
      priority: input.priority,
      scheduledFor: input.scheduledFor,
      status: existing?.status === "completed" || existing?.status === "failed" ? "queued" : existing?.status ?? "queued",
    },
    create: {
      dedupeKey: key,
      type: input.type,
      target: input.target,
      url: input.url,
      priority: input.priority,
      scheduledFor: input.scheduledFor,
    },
  });
}

function dedupeKey(type: string, target: string) {
  return `${type}:${target.toLowerCase()}`;
}
