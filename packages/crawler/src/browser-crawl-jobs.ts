import { prisma, type BrowserCrawlJob } from "@rdgw/database";

export type BrowserCrawlJobType = "subreddit_new_hourly" | "subreddit_sort_daily" | "user_full_scroll";

const JOB_LEASE_MS = 30 * 60 * 1000;

let forcedSubredditBootstrapQueued = false;

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

export function getBotConfig() {
  const subreddit = process.env.REDDIT_SUBREDDIT ?? "daresgonewild";

  return {
    subreddit,
    newIntervalMs: getIntegerEnv("CRAWLER_NEW_INTERVAL_MS", 60 * 60 * 1000),
    dailySortIntervalMs: getIntegerEnv("CRAWLER_DAILY_SORT_INTERVAL_MS", 24 * 60 * 60 * 1000),
    userRecrawlMs: getIntegerEnv("CRAWLER_USER_RECRAWL_MS", 24 * 60 * 60 * 1000),
    idleSleepMs: getIntegerEnv("CRAWLER_IDLE_SLEEP_MS", 60 * 1000),
    scrollWaitMs: getIntegerEnv("CRAWLER_SCROLL_WAIT_MS", 1500),
    scrollStableRounds: getIntegerEnv("CRAWLER_SCROLL_STABLE_ROUNDS", 6),
    maxScrollsPerPage: getIntegerEnv("CRAWLER_MAX_SCROLLS_PER_PAGE", 10000),

    /**
     * If true, the bot force-queues all subreddit checks once after startup,
     * even if they ran recently.
     *
     * This guarantees the startup order is:
     * 1. subreddit new
     * 2. subreddit best/hot/top_day
     * 3. user profile filler jobs
     */
    forceSubredditBeforeUsers: getBooleanEnv("CRAWLER_FORCE_SUBREDDIT_BEFORE_USERS", true),
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
  const subredditJobs = getSubredditJobDefinitions(config.subreddit);

  const forceSubredditNow = config.forceSubredditBeforeUsers && !forcedSubredditBootstrapQueued;

  if (forceSubredditNow) {
    forcedSubredditBootstrapQueued = true;

    console.log(
      "[crawler-jobs] CRAWLER_FORCE_SUBREDDIT_BEFORE_USERS=true; " +
        "forcing all subreddit checks before user jobs",
    );
  }

  for (const job of subredditJobs) {
    await ensureRecurringJob({
      ...job,
      intervalMs: job.type === "subreddit_new_hourly" ? config.newIntervalMs : config.dailySortIntervalMs,
      forceNow: forceSubredditNow,
    });
  }

  /**
   * User jobs are filler work.
   * If any subreddit job is due, do not spend this loop creating more user jobs.
   */
  if (await hasDueSubredditJob()) {
    return;
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

function getSubredditJobDefinitions(subreddit: string) {
  const base = `https://www.reddit.com/r/${subreddit}`;

  return [
    {
      type: "subreddit_new_hourly" as const,
      target: subreddit,
      url: `${base}/new/`,
      priority: 100,
    },
    {
      type: "subreddit_sort_daily" as const,
      target: `${subreddit}:best`,
      url: `${base}/best/`,
      priority: 80,
    },
    {
      type: "subreddit_sort_daily" as const,
      target: `${subreddit}:hot`,
      url: `${base}/hot/`,
      priority: 80,
    },
    {
      type: "subreddit_sort_daily" as const,
      target: `${subreddit}:top_day`,
      url: `${base}/top/?t=day`,
      priority: 80,
    },
  ];
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

export async function queueUserJob(username: string, scheduledFor = new Date()) {
  const safeUsername = username.replace(/^u\//i, "").trim();
  if (!safeUsername || safeUsername === "[deleted]") return;

  await upsertJob({
    type: "user_full_scroll",
    target: safeUsername,
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
  forceNow?: boolean;
}) {
  const now = new Date();

  const existing = await prisma.browserCrawlJob.findUnique({
    where: { dedupeKey: dedupeKey(input.type, input.target) },
  });

  if (!existing) {
    await upsertJob({
      ...input,
      scheduledFor: now,
      forceReschedule: true,
    });
    return;
  }

  if (existing.status === "running") {
    return;
  }

  if (input.forceNow || existing.scheduledFor <= now) {
    await prisma.browserCrawlJob.update({
      where: { id: existing.id },
      data: {
        status: "queued",
        url: input.url,
        priority: input.priority,
        scheduledFor: input.forceNow ? now : existing.scheduledFor,
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
}) {
  const key = dedupeKey(input.type, input.target);

  const existing = await prisma.browserCrawlJob.findUnique({
    where: { dedupeKey: key },
  });

  if (existing?.status === "running") return;

  /**
   * For user jobs, do not pull a future completed job back to now just because
   * the author appeared in another scan.
   */
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
      url: input.url,
      priority: input.priority,
      scheduledFor: input.scheduledFor,
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
    },
  });
}

function dedupeKey(type: string, target: string) {
  return `${type}:${target.toLowerCase()}`;
}