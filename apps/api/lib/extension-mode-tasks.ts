import { randomUUID } from "node:crypto";

import { Prisma, prisma } from "@rdgw/database";

export type ExtensionMode = "system" | "backfill" | "current";
export type ExtensionSort = "best" | "new";
export type ExtensionScope = "subreddit" | "user" | "home";

export interface ExtensionModeTaskRequest {
  mode?: unknown;
  subreddit?: unknown;
  sort?: unknown;
  url?: unknown;
  sourceUrl?: unknown;
  installId?: unknown;
  clientVersion?: unknown;
}

export class ExtensionModeTaskError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

interface ExtensionJobState {
  source: "extension-scheduler";
  mode: ExtensionMode;
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

const SYSTEM_SUBREDDITS = [
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
];

export async function startExtensionModeTask(rawBody: unknown) {
  const body = readObject(rawBody);
  const mode = readMode(body.mode);

  if (mode === "system") return createSystemTask(body);
  if (mode === "backfill") return createBackfillTask(body);
  return createCurrentPageTask(body);
}

async function createSystemTask(body: Record<string, unknown>) {
  const subreddit = normaliseSubreddit(readString(body.subreddit));
  if (!subreddit) throw new ExtensionModeTaskError("system mode requires subreddit", 400);

  const allowed = new Set(SYSTEM_SUBREDDITS.map((value) => value.toLowerCase()));
  if (!allowed.has(subreddit.toLowerCase())) {
    throw new ExtensionModeTaskError(`Refusing non-system subreddit for system mode: ${subreddit}`, 400);
  }

  const sort = readSort(body.sort) ?? "new";
  const url = subredditUrl(subreddit, sort);
  return { task: await createModeJob({ mode: "system", scope: "subreddit", subreddit, sort, url, maxPages: 999 }) };
}

async function createBackfillTask(body: Record<string, unknown>) {
  const requested = normaliseSubreddit(readString(body.subreddit));
  const sort = readSort(body.sort) ?? "new";

  const selected = requested
    ? { subreddit: requested }
    : await prisma.siteSubreddit.findFirst({
        where: { enabled: true },
        orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
        select: { subreddit: true },
      });

  if (!selected?.subreddit) {
    return { task: null, idle: true, message: "No verified NSFW subreddits available for backfill yet." };
  }

  const subreddit = normaliseSubreddit(selected.subreddit);
  const url = subredditUrl(subreddit, sort);
  return { task: await createModeJob({ mode: "backfill", scope: "subreddit", subreddit, sort, url, maxPages: 999 }) };
}

async function createCurrentPageTask(body: Record<string, unknown>) {
  const url = readString(body.url) || readString(body.sourceUrl);
  if (!/^https:\/\/(?:www\.|old\.)?reddit\.com\//i.test(url)) {
    throw new ExtensionModeTaskError("current mode requires a reddit.com URL", 400);
  }

  const subreddit = normaliseSubreddit(extractSubreddit(url) || readString(body.subreddit) || "current-page");
  const sort = readSort(body.sort) ?? extractSort(url) ?? "new";

  return {
    task: await createModeJob({
      mode: "current",
      scope: subreddit === "current-page" ? "home" : "subreddit",
      subreddit: subreddit === "current-page" ? undefined : subreddit,
      sort,
      url,
      maxPages: 999,
    }),
  };
}

async function createModeJob(input: {
  mode: ExtensionMode;
  scope: ExtensionScope;
  subreddit?: string;
  sort?: ExtensionSort;
  url: string;
  maxPages: number;
}) {
  const now = new Date();
  const target = input.subreddit ? `${input.subreddit}:${input.sort ?? "new"}` : input.url;
  const jsonUrl = `${input.url.replace(/\/?$/, "/")}.json`;
  const state: ExtensionJobState = {
    source: "extension-scheduler",
    mode: input.mode,
    scope: input.scope,
    sort: input.sort,
    subreddit: input.subreddit,
    jsonUrl,
    maxPages: input.maxPages,
    stopAtKnown: false,
  };

  const job = await prisma.browserCrawlJob.create({
    data: {
      dedupeKey: `extension-mode:${input.mode}:${target}:${now.getTime()}:${randomUUID()}`,
      type: `extension_${input.mode}_${input.scope}`,
      target,
      url: input.url,
      status: "running",
      priority: input.mode === "system" ? 10_000 : input.mode === "backfill" ? 2_000 : 1_000,
      scheduledFor: now,
      startedAt: now,
      leaseUntil: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      attempts: 1,
      state: toJsonState(state),
    },
  });

  return {
    id: job.id,
    type: job.type,
    target: job.target,
    url: job.url,
    jsonUrl,
    scope: input.scope,
    sort: input.sort,
    subreddit: input.subreddit,
    maxPages: input.maxPages,
    stopAtKnown: false,
    requiresLoggedInReddit: true,
    attempts: job.attempts,
    mode: input.mode,
  };
}

function subredditUrl(subreddit: string, sort: ExtensionSort) {
  return sort === "best" ? `https://www.reddit.com/r/${subreddit}/` : `https://www.reddit.com/r/${subreddit}/new/`;
}

function extractSubreddit(url: string) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/r\/([^/?#]+)/i);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

function extractSort(url: string): ExtensionSort | undefined {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.includes("/new")) return "new";
    if (pathname.includes("/best") || pathname.match(/^\/r\/[^/]+\/?$/)) return "best";
  } catch {
    // ignore
  }
  return undefined;
}

function readMode(value: unknown): ExtensionMode {
  if (value === "system" || value === "backfill" || value === "current") return value;
  throw new ExtensionModeTaskError("mode must be system, backfill, or current", 400);
}

function readSort(value: unknown): ExtensionSort | undefined {
  return value === "best" || value === "new" ? value : undefined;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normaliseSubreddit(value: string) {
  return value.replace(/^r\//i, "").trim();
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExtensionModeTaskError("JSON object body required", 400);
  }
  return value as Record<string, unknown>;
}

function toJsonState(state: ExtensionJobState): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(state).filter(([, value]) => value !== undefined)) as Prisma.InputJsonObject;
}
