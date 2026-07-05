import { prisma, type BrowserCrawlJob } from "@rdgw/database";
import { processPost } from "@rdgw/crawler";
import { normaliseListingPage, type RedditListing, type RedditPost } from "@rdgw/crawler/reddit";
import fs from "node:fs";
import path from "node:path";

export type ExtensionSort = "best" | "new";
export type ExtensionScope = "home" | "subreddit" | "user";

export interface ExtensionTargetsConfig {
  coreSubreddits: string[];
  coreSorts: ExtensionSort[];
  homeSorts: ExtensionSort[];
  includeDbSubreddits: boolean;
  intervalMinutes: {
    homeNew: number;
    homeBest: number;
    coreNew: number;
    coreBest: number;
    otherNew: number;
    otherBest: number;
    userFallback: number;
  };
  maxPages: {
    home: number;
    coreSubreddit: number;
    otherSubreddit: number;
    userFallback: number;
  };
  fallbackUserBatchSize: number;
  queueUsersPerCompletedTask: number;
}

interface ExtensionJobState {
  source: "extension-scheduler";
  scope: ExtensionScope;
  sort?: ExtensionSort;
  subreddit?: string;
  username?: string;
  jsonUrl: string;
  maxPages: number;
  stopAtKnown: boolean;
  crawlRunId?: string;
  pagesScanned?: number;
  rawPostsSeen?: number;
  postsProcessed?: number;
  completionsFound?: number;
  authors?: string[];
  lastAfter?: string | null;
  exhausted?: boolean;
  reachedKnown?: boolean;
}

export interface ExtensionTaskResponse {
  id: string;
  type: string;
  target: string;
  url: string;
  jsonUrl: string;
  scope: ExtensionScope;
  sort?: ExtensionSort;
  subreddit?: string;
  username?: string;
  maxPages: number;
  stopAtKnown: boolean;
  requiresLoggedInReddit: boolean;
  attempts: number;
}

export interface ExtensionIngestResult {
  jobId: string;
  pagesScanned: number;
  rawPostsSeen: number;
  postsProcessed: number;
  completionsFound: number;
  authors: string[];
  after: string | null;
  exhausted: boolean;
  reachedKnown: boolean;
  shouldContinue: boolean;
}

const EXTENSION_TYPE_PREFIX = "extension_";
const JOB_LEASE_MS = readIntegerEnv("EXTENSION_JOB_LEASE_MS", 20 * 60 * 1000);
const FALLBACK_CONFIG_PATH = "config/extension-crawl-targets.json";

const DEFAULT_CONFIG: ExtensionTargetsConfig = {
  coreSubreddits: [
    "daresgonewild",
    "FlashingAndFlaunting",
    "RealPublicNudity",
    "ExhibitionistGirl",
    "ChanginginPublic",
    "CMNF",
    "onlyonenaked",
    "outdoorgirls",
    "Permanent_Nude",
    "BralessForever",
  ],
  coreSorts: ["best", "new"],
  homeSorts: ["best", "new"],
  includeDbSubreddits: true,
  intervalMinutes: {
    homeNew: 60,
    homeBest: 360,
    coreNew: 60,
    coreBest: 360,
    otherNew: 720,
    otherBest: 1440,
    userFallback: 1440,
  },
  maxPages: {
    home: 3,
    coreSubreddit: 3,
    otherSubreddit: 2,
    userFallback: 2,
  },
  fallbackUserBatchSize: 20,
  queueUsersPerCompletedTask: 40,
};

export class ExtensionTaskError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function isExtensionJob(job: Pick<BrowserCrawlJob, "type">) {
  return job.type.startsWith(EXTENSION_TYPE_PREFIX);
}

export function loadExtensionTargetsConfig(): ExtensionTargetsConfig {
  const configuredPath = process.env.EXTENSION_TARGETS_CONFIG?.trim();
  const configPaths = configuredPath
    ? [configuredPath]
    : [
        path.resolve(process.cwd(), FALLBACK_CONFIG_PATH),
        path.resolve(process.cwd(), "apps/api", FALLBACK_CONFIG_PATH),
      ];

  const filePath = configPaths.find((candidate) => fs.existsSync(candidate));
  if (!filePath) return configFromEnv(DEFAULT_CONFIG);

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<ExtensionTargetsConfig>;
    return configFromEnv(mergeConfig(DEFAULT_CONFIG, raw));
  } catch (error) {
    console.warn(`[extension-scheduler] failed to read ${filePath}; using defaults`, error);
    return configFromEnv(DEFAULT_CONFIG);
  }
}

export async function claimNextExtensionTask() {
  await ensureExtensionDueJobs();

  let job = await claimQueuedExtensionJob();
  if (!job) {
    await queueFallbackUserJobs();
    job = await claimQueuedExtensionJob();
  }

  return job ? toExtensionTaskResponse(job) : null;
}

export async function ingestExtensionListing(jobId: string, body: unknown): Promise<ExtensionIngestResult> {
  const job = await findExtensionJob(jobId);
  const state = getExtensionState(job);
  const listing = readListingFromBody(body);
  const page = normaliseListingPage(listing);
  const crawlRunId = state.crawlRunId ?? (await createCrawlRun(job));

  const matchingPosts = filterPostsForJob(page.posts, state);
  const postsToProcess: RedditPost[] = [];
  let reachedKnown = false;

  if (state.stopAtKnown && state.scope === "subreddit" && state.subreddit) {
    const knownIds = await fetchKnownRedditIds(state.subreddit, matchingPosts.map((post) => post.id));

    for (const post of matchingPosts) {
      if (knownIds.has(post.id)) {
        reachedKnown = true;
        break;
      }
      postsToProcess.push(post);
    }
  } else {
    postsToProcess.push(...matchingPosts);
  }

  let completionsFound = 0;
  const authors = new Set(state.authors ?? []);

  for (const post of postsToProcess) {
    completionsFound += await processPost(post, prisma, crawlRunId);
    authors.add(post.author);
  }

  const nextState: ExtensionJobState = {
    ...state,
    crawlRunId,
    pagesScanned: (state.pagesScanned ?? 0) + 1,
    rawPostsSeen: (state.rawPostsSeen ?? 0) + page.rawCount,
    postsProcessed: (state.postsProcessed ?? 0) + postsToProcess.length,
    completionsFound: (state.completionsFound ?? 0) + completionsFound,
    authors: [...authors].slice(0, 250),
    lastAfter: page.after,
    exhausted: !page.after,
    reachedKnown: Boolean(state.reachedKnown || reachedKnown),
  };

  await prisma.crawlRun.update({
    where: { id: crawlRunId },
    data: {
      pagesScanned: nextState.pagesScanned ?? 0,
      postsFound: nextState.postsProcessed ?? 0,
      completionsDetected: nextState.completionsFound ?? 0,
    },
  });

  await prisma.browserCrawlJob.update({
    where: { id: job.id },
    data: { state: nextState },
  });

  const shouldContinue =
    !nextState.exhausted &&
    !nextState.reachedKnown &&
    (nextState.pagesScanned ?? 0) < state.maxPages;

  return {
    jobId,
    pagesScanned: nextState.pagesScanned ?? 0,
    rawPostsSeen: nextState.rawPostsSeen ?? 0,
    postsProcessed: nextState.postsProcessed ?? 0,
    completionsFound: nextState.completionsFound ?? 0,
    authors: nextState.authors ?? [],
    after: nextState.lastAfter ?? null,
    exhausted: Boolean(nextState.exhausted),
    reachedKnown: Boolean(nextState.reachedKnown),
    shouldContinue,
  };
}

export async function completeExtensionTask(jobId: string, body: unknown) {
  const job = await findExtensionJob(jobId);
  const state = getExtensionState(job);
  const payload = readObject(body);
  const error = readOptionalString(payload.error);

  if (error) {
    const retryDelayMs = Math.min(60 * 60 * 1000, 5 * 60_000 * Math.max(1, job.attempts));
    const scheduledFor = new Date(Date.now() + retryDelayMs);

    await prisma.browserCrawlJob.update({
      where: { id: job.id },
      data: {
        status: "queued",
        scheduledFor,
        startedAt: null,
        completedAt: null,
        leaseUntil: null,
        lastError: error.slice(0, 2000),
      },
    });

    return { status: "queued", scheduledFor: scheduledFor.toISOString(), retry: true };
  }

  if (state.crawlRunId) {
    await prisma.crawlRun.update({
      where: { id: state.crawlRunId },
      data: {
        status: "completed",
        completedAt: new Date(),
        pagesScanned: state.pagesScanned ?? 0,
        postsFound: state.postsProcessed ?? 0,
        completionsDetected: state.completionsFound ?? 0,
      },
    });
  }

  if (state.scope === "user" && state.username) {
    await prisma.dgwUser.upsert({
      where: { username: state.username },
      update: { syncStatus: "fresh", lastSyncedAt: new Date() },
      create: { username: state.username, syncStatus: "fresh", lastSyncedAt: new Date() },
    });
  }

  if (state.scope !== "user") {
    const config = loadExtensionTargetsConfig();
    const subreddit = state.subreddit ?? firstCoreSubreddit(config);
    const authors = (state.authors ?? []).slice(0, config.queueUsersPerCompletedTask);

    for (const author of authors) {
      await ensureUserJob(author, subreddit, new Date());
    }
  }

  const scheduledFor = getNextScheduledFor(job, state, loadExtensionTargetsConfig());
  const completedState: ExtensionJobState = {
    ...state,
    exhausted: readOptionalBoolean(payload.exhausted) ?? state.exhausted,
    reachedKnown: readOptionalBoolean(payload.reachedKnown) ?? state.reachedKnown,
  };

  await prisma.browserCrawlJob.update({
    where: { id: job.id },
    data: {
      status: "completed",
      scheduledFor,
      completedAt: new Date(),
      startedAt: null,
      leaseUntil: null,
      lastError: null,
      state: resetRunState(completedState),
    },
  });

  return {
    status: "completed",
    scheduledFor: scheduledFor.toISOString(),
    pagesScanned: state.pagesScanned ?? 0,
    postsProcessed: state.postsProcessed ?? 0,
    completionsFound: state.completionsFound ?? 0,
  };
}

async function ensureExtensionDueJobs() {
  await recoverExpiredExtensionJobs();

  const config = loadExtensionTargetsConfig();
  const coreSubreddits = uniqueSubreddits(config.coreSubreddits);
  const coreSet = new Set(coreSubreddits.map((value) => value.toLowerCase()));

  for (const sort of config.homeSorts) {
    await ensureRecurringExtensionJob(buildHomeJob(sort, config));
  }

  for (const subreddit of coreSubreddits) {
    for (const sort of config.coreSorts) {
      await ensureRecurringExtensionJob(buildSubredditJob(subreddit, sort, true, config));
    }
  }

  if (!config.includeDbSubreddits) return;

  const [siteSubreddits, postSubreddits] = await Promise.all([
    prisma.siteSubreddit.findMany({
      where: { enabled: true },
      select: { subreddit: true },
      take: 1000,
    }),
    prisma.dgwPost.findMany({
      select: { subreddit: true },
      distinct: ["subreddit"],
      take: 1000,
    }),
  ]);

  for (const subreddit of uniqueSubreddits([
    ...siteSubreddits.map((row) => row.subreddit),
    ...postSubreddits.map((row) => row.subreddit),
  ])) {
    if (coreSet.has(subreddit.toLowerCase())) continue;

    for (const sort of config.coreSorts) {
      await ensureRecurringExtensionJob(buildSubredditJob(subreddit, sort, false, config));
    }
  }
}

async function recoverExpiredExtensionJobs() {
  await prisma.browserCrawlJob.updateMany({
    where: {
      status: "running",
      type: { startsWith: EXTENSION_TYPE_PREFIX },
      OR: [{ leaseUntil: { lt: new Date() } }, { leaseUntil: null }],
    },
    data: {
      status: "queued",
      startedAt: null,
      leaseUntil: null,
      lastError: "Recovered after expired extension lease",
    },
  });
}

async function claimQueuedExtensionJob() {
  const now = new Date();
  const job = await prisma.browserCrawlJob.findFirst({
    where: {
      status: "queued",
      scheduledFor: { lte: now },
      type: { startsWith: EXTENSION_TYPE_PREFIX },
    },
    orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }, { createdAt: "asc" }],
  });

  if (!job) return null;

  const state = resetRunState(getExtensionState(job));
  const claimed = await prisma.browserCrawlJob.updateMany({
    where: { id: job.id, status: "queued" },
    data: {
      status: "running",
      startedAt: now,
      leaseUntil: new Date(now.getTime() + JOB_LEASE_MS),
      attempts: { increment: 1 },
      lastError: null,
      state,
    },
  });

  if (claimed.count === 0) return null;

  return prisma.browserCrawlJob.findUniqueOrThrow({ where: { id: job.id } });
}

async function ensureRecurringExtensionJob(definition: ExtensionJobDefinition) {
  const now = new Date();
  const existing = await prisma.browserCrawlJob.findUnique({ where: { dedupeKey: definition.dedupeKey } });

  if (!existing) {
    await prisma.browserCrawlJob.create({
      data: {
        dedupeKey: definition.dedupeKey,
        type: definition.type,
        target: definition.target,
        url: definition.url,
        status: "queued",
        priority: definition.priority,
        scheduledFor: definition.scheduledFor ?? now,
        state: definition.state,
      },
    });
    return;
  }

  const shouldRequeue = ["completed", "failed"].includes(existing.status) && existing.scheduledFor <= now;

  await prisma.browserCrawlJob.update({
    where: { id: existing.id },
    data: {
      type: definition.type,
      target: definition.target,
      url: definition.url,
      priority: definition.priority,
      ...(shouldRequeue
        ? {
            status: "queued",
            scheduledFor: definition.scheduledFor ?? now,
            startedAt: null,
            completedAt: null,
            leaseUntil: null,
            lastError: null,
            state: definition.state,
          }
        : { state: mergeStableState(getExtensionState(existing), definition.state) }),
    },
  });
}

async function queueFallbackUserJobs() {
  const config = loadExtensionTargetsConfig();
  const cutoff = new Date(Date.now() - config.intervalMinutes.userFallback * 60_000);
  const users = await prisma.dgwUser.findMany({
    where: {
      username: { not: "[deleted]" },
      OR: [
        { lastSyncedAt: null },
        { lastSyncedAt: { lt: cutoff } },
        { syncStatus: { in: ["never", "stale"] } },
      ],
    },
    orderBy: [{ lastSyncedAt: "asc" }, { updatedAt: "asc" }],
    select: { username: true },
    take: config.fallbackUserBatchSize,
  });

  const fallbackSubreddit = firstCoreSubreddit(config);
  const now = new Date();

  for (const user of users) {
    await ensureUserJob(user.username, fallbackSubreddit, now);
  }
}

async function ensureUserJob(username: string, fallbackSubreddit: string, scheduledFor: Date) {
  const safeUsername = username.replace(/^u\//i, "").trim();
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(safeUsername)) return;

  const config = loadExtensionTargetsConfig();
  const url = `https://www.reddit.com/user/${encodeURIComponent(safeUsername)}/submitted/`;
  const state: ExtensionJobState = {
    source: "extension-scheduler",
    scope: "user",
    username: safeUsername,
    subreddit: fallbackSubreddit,
    jsonUrl: `${url.replace(/\/$/, "")}.json?limit=100&raw_json=1`,
    maxPages: config.maxPages.userFallback,
    stopAtKnown: false,
  };

  await ensureRecurringExtensionJob({
    dedupeKey: `extension:user:${safeUsername.toLowerCase()}`,
    type: "extension_user_submitted",
    target: safeUsername,
    url,
    priority: 10,
    state,
    scheduledFor,
  });
}

interface ExtensionJobDefinition {
  dedupeKey: string;
  type: string;
  target: string;
  url: string;
  priority: number;
  state: ExtensionJobState;
  scheduledFor?: Date;
}

function buildHomeJob(sort: ExtensionSort, config: ExtensionTargetsConfig): ExtensionJobDefinition {
  const url = `https://www.reddit.com/${sort}/`;
  return {
    dedupeKey: `extension:home:${sort}`,
    type: `extension_home_${sort}`,
    target: `home:${sort}`,
    url,
    priority: sort === "new" ? 120 : 115,
    state: {
      source: "extension-scheduler",
      scope: "home",
      sort,
      jsonUrl: `https://www.reddit.com/${sort}.json?limit=100&raw_json=1`,
      maxPages: config.maxPages.home,
      stopAtKnown: false,
    },
  };
}

function buildSubredditJob(
  subreddit: string,
  sort: ExtensionSort,
  isCore: boolean,
  config: ExtensionTargetsConfig,
): ExtensionJobDefinition {
  const cleanSubreddit = normaliseSubreddit(subreddit);
  const url = `https://www.reddit.com/r/${encodeURIComponent(cleanSubreddit)}/${sort}/`;
  return {
    dedupeKey: `extension:subreddit:${cleanSubreddit.toLowerCase()}:${sort}`,
    type: `extension_subreddit_${sort}`,
    target: `${cleanSubreddit}:${sort}`,
    url,
    priority: isCore ? (sort === "new" ? 100 : 95) : sort === "new" ? 55 : 50,
    state: {
      source: "extension-scheduler",
      scope: "subreddit",
      sort,
      subreddit: cleanSubreddit,
      jsonUrl: `${url.replace(/\/$/, "")}.json?limit=100&raw_json=1`,
      maxPages: isCore ? config.maxPages.coreSubreddit : config.maxPages.otherSubreddit,
      stopAtKnown: sort === "new",
    },
  };
}

function toExtensionTaskResponse(job: BrowserCrawlJob): ExtensionTaskResponse {
  const state = getExtensionState(job);

  return {
    id: job.id,
    type: job.type,
    target: job.target,
    url: job.url,
    jsonUrl: state.jsonUrl,
    scope: state.scope,
    sort: state.sort,
    subreddit: state.subreddit,
    username: state.username,
    maxPages: state.maxPages,
    stopAtKnown: state.stopAtKnown,
    requiresLoggedInReddit: state.scope === "home",
    attempts: job.attempts,
  };
}

async function findExtensionJob(jobId: string) {
  const job = await prisma.browserCrawlJob.findUnique({ where: { id: jobId } });
  if (!job || !isExtensionJob(job)) throw new ExtensionTaskError("Extension task not found", 404);
  return job;
}

async function createCrawlRun(job: BrowserCrawlJob) {
  const run = await prisma.crawlRun.create({
    data: { type: job.type, target: job.target },
    select: { id: true },
  });
  return run.id;
}

function filterPostsForJob(posts: RedditPost[], state: ExtensionJobState) {
  if (state.scope !== "subreddit" || !state.subreddit) return posts;
  const target = state.subreddit.toLowerCase();
  return posts.filter((post) => post.subreddit.toLowerCase() === target);
}

async function fetchKnownRedditIds(subreddit: string, redditIds: string[]) {
  if (redditIds.length === 0) return new Set<string>();

  const rows = await prisma.dgwPost.findMany({
    where: { subreddit, redditId: { in: redditIds } },
    select: { redditId: true },
  });

  return new Set(rows.map((row) => row.redditId));
}

function getNextScheduledFor(job: BrowserCrawlJob, state: ExtensionJobState, config: ExtensionTargetsConfig) {
  const minutes = getIntervalMinutes(job, state, config);
  return new Date(Date.now() + minutes * 60_000);
}

function getIntervalMinutes(job: BrowserCrawlJob, state: ExtensionJobState, config: ExtensionTargetsConfig) {
  if (state.scope === "home") return state.sort === "new" ? config.intervalMinutes.homeNew : config.intervalMinutes.homeBest;
  if (state.scope === "user") return config.intervalMinutes.userFallback;

  const core = new Set(uniqueSubreddits(config.coreSubreddits).map((value) => value.toLowerCase()));
  const isCore = state.subreddit ? core.has(state.subreddit.toLowerCase()) : job.priority >= 90;

  if (isCore) return state.sort === "new" ? config.intervalMinutes.coreNew : config.intervalMinutes.coreBest;
  return state.sort === "new" ? config.intervalMinutes.otherNew : config.intervalMinutes.otherBest;
}

function getExtensionState(job: BrowserCrawlJob): ExtensionJobState {
  const raw = typeof job.state === "object" && job.state !== null && !Array.isArray(job.state) ? job.state : {};
  const value = raw as Partial<ExtensionJobState>;

  if (value.source === "extension-scheduler" && value.scope && value.jsonUrl) {
    return {
      source: "extension-scheduler",
      scope: value.scope,
      sort: normaliseSort(value.sort),
      subreddit: value.subreddit ? normaliseSubreddit(value.subreddit) : undefined,
      username: value.username,
      jsonUrl: value.jsonUrl,
      maxPages: asPositiveInteger(value.maxPages, 2),
      stopAtKnown: Boolean(value.stopAtKnown),
      crawlRunId: value.crawlRunId,
      pagesScanned: asNonNegativeInteger(value.pagesScanned, 0),
      rawPostsSeen: asNonNegativeInteger(value.rawPostsSeen, 0),
      postsProcessed: asNonNegativeInteger(value.postsProcessed, 0),
      completionsFound: asNonNegativeInteger(value.completionsFound, 0),
      authors: Array.isArray(value.authors) ? value.authors.filter((author): author is string => typeof author === "string") : [],
      lastAfter: typeof value.lastAfter === "string" || value.lastAfter === null ? value.lastAfter : undefined,
      exhausted: Boolean(value.exhausted),
      reachedKnown: Boolean(value.reachedKnown),
    };
  }

  return inferStateFromLegacyJob(job, loadExtensionTargetsConfig());
}

function inferStateFromLegacyJob(job: BrowserCrawlJob, config: ExtensionTargetsConfig): ExtensionJobState {
  if (job.type === "extension_user_submitted") {
    const username = job.target.replace(/^user:/, "");
    return {
      source: "extension-scheduler",
      scope: "user",
      username,
      subreddit: firstCoreSubreddit(config),
      jsonUrl: `https://www.reddit.com/user/${encodeURIComponent(username)}/submitted.json?limit=100&raw_json=1`,
      maxPages: config.maxPages.userFallback,
      stopAtKnown: false,
    };
  }

  if (job.type.startsWith("extension_home_")) {
    const sort = normaliseSort(job.target.split(":")[1]) ?? "best";
    return buildHomeJob(sort, config).state;
  }

  const [subreddit = firstCoreSubreddit(config), rawSort = "new"] = job.target.split(":");
  const sort = normaliseSort(rawSort) ?? "new";
  const core = new Set(uniqueSubreddits(config.coreSubreddits).map((value) => value.toLowerCase()));
  return buildSubredditJob(subreddit, sort, core.has(subreddit.toLowerCase()), config).state;
}

function resetRunState(state: ExtensionJobState): ExtensionJobState {
  return {
    source: "extension-scheduler",
    scope: state.scope,
    sort: state.sort,
    subreddit: state.subreddit,
    username: state.username,
    jsonUrl: state.jsonUrl,
    maxPages: state.maxPages,
    stopAtKnown: state.stopAtKnown,
  };
}

function mergeStableState(existing: ExtensionJobState, next: ExtensionJobState): ExtensionJobState {
  const running = Boolean(existing.crawlRunId || existing.pagesScanned || existing.rawPostsSeen);
  return running ? { ...next, ...existing, jsonUrl: next.jsonUrl, maxPages: next.maxPages } : next;
}

function readListingFromBody(body: unknown): RedditListing {
  const payload = readObject(body);
  const listing = payload.listing ?? payload;

  if (!isObject(listing) || !isObject(listing.data) || !Array.isArray(listing.data.children)) {
    throw new ExtensionTaskError("Body must contain a Reddit listing JSON object", 400);
  }

  return listing as RedditListing;
}

function readObject(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new ExtensionTaskError("JSON object body required", 400);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function configFromEnv(config: ExtensionTargetsConfig): ExtensionTargetsConfig {
  const envSubreddits = process.env.EXTENSION_CORE_SUBREDDITS?.split(",").map(normaliseSubreddit).filter(Boolean);
  return {
    ...config,
    coreSubreddits: envSubreddits?.length ? uniqueSubreddits(envSubreddits) : uniqueSubreddits(config.coreSubreddits),
    coreSorts: normaliseSorts(config.coreSorts, DEFAULT_CONFIG.coreSorts),
    homeSorts: normaliseSorts(config.homeSorts, DEFAULT_CONFIG.homeSorts),
  };
}

function mergeConfig(base: ExtensionTargetsConfig, raw: Partial<ExtensionTargetsConfig>): ExtensionTargetsConfig {
  return {
    ...base,
    ...raw,
    coreSubreddits: Array.isArray(raw.coreSubreddits) ? raw.coreSubreddits : base.coreSubreddits,
    coreSorts: normaliseSorts(raw.coreSorts, base.coreSorts),
    homeSorts: normaliseSorts(raw.homeSorts, base.homeSorts),
    intervalMinutes: { ...base.intervalMinutes, ...(raw.intervalMinutes ?? {}) },
    maxPages: { ...base.maxPages, ...(raw.maxPages ?? {}) },
    fallbackUserBatchSize: asPositiveInteger(raw.fallbackUserBatchSize, base.fallbackUserBatchSize),
    queueUsersPerCompletedTask: asPositiveInteger(raw.queueUsersPerCompletedTask, base.queueUsersPerCompletedTask),
    includeDbSubreddits: raw.includeDbSubreddits ?? base.includeDbSubreddits,
  };
}

function normaliseSorts(value: unknown, fallback: ExtensionSort[]) {
  if (!Array.isArray(value)) return fallback;
  const sorts = value.map(normaliseSort).filter((sort): sort is ExtensionSort => Boolean(sort));
  return sorts.length ? [...new Set(sorts)] : fallback;
}

function normaliseSort(value: unknown): ExtensionSort | undefined {
  if (value === "best" || value === "new") return value;
  return undefined;
}

function uniqueSubreddits(values: string[]) {
  const seen = new Set<string>();
  return values
    .map(normaliseSubreddit)
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normaliseSubreddit(value: string) {
  return value.replace(/^r\//i, "").trim();
}

function firstCoreSubreddit(config: ExtensionTargetsConfig) {
  return uniqueSubreddits(config.coreSubreddits)[0] ?? "daresgonewild";
}

function readIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function asPositiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function asNonNegativeInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}
