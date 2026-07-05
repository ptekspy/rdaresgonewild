export {};
interface ExtensionSettings {
  apiBaseUrl: string;
  pollSeconds: number;
  enabled: boolean;
  workerTabId?: number;
  installId?: string;
}

interface ExtensionTask {
  id: string;
  type: string;
  target: string;
  url: string;
  jsonUrl: string;
  scope: "home" | "subreddit" | "user";
  sort?: "best" | "new";
  subreddit?: string;
  username?: string;
  maxPages: number;
  stopAtKnown: boolean;
  requiresLoggedInReddit: boolean;
}

interface NextTaskResponse {
  task: ExtensionTask | null;
  idle: boolean;
  retryAfterMs?: number;
}

interface IngestResponse {
  after: string | null;
  shouldContinue: boolean;
  exhausted: boolean;
  reachedKnown: boolean;
  pagesScanned: number;
  rawPostsSeen: number;
  postsProcessed: number;
  completionsFound: number;
}

const ALARM_NAME = "paidpolitely-extension-worker";
const CLIENT_VERSION = "0.1.0";
const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: "http://localhost:8787",
  pollSeconds: 30,
  enabled: true,
};

let running = false;

chrome.runtime.onInstalled.addListener(() => {
  void initialise();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void runOnce();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const typed = isRecord(message) ? message : {};

  if (typed.type === "PAIDPOLITELY_RUN_NOW") {
    void runOnce()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  return undefined;
});

async function initialise() {
  const settings = await getSettings();
  await ensureInstallId(settings);
  schedule(settings.pollSeconds);
  await setStatus("ready", "Worker installed");
}

async function runOnce() {
  if (running) return "already-running";
  running = true;
  chrome.action.setBadgeText({ text: "…" });

  try {
    const settings = await getSettings();
    if (!settings.enabled) {
      await setStatus("disabled", "Worker disabled");
      chrome.action.setBadgeText({ text: "off" });
      return "disabled";
    }

    await ensureInstallId(settings);
    schedule(settings.pollSeconds);

    const next = await fetchJson<NextTaskResponse>(settings, "/api/extension/task/next", {
      method: "POST",
      body: {
        installId: settings.installId,
        clientVersion: CLIENT_VERSION,
      },
    });

    if (!next.task) {
      await setStatus("idle", `Idle. Retrying in ${Math.round((next.retryAfterMs ?? settings.pollSeconds * 1000) / 1000)}s.`);
      chrome.action.setBadgeText({ text: "idle" });
      return "idle";
    }

    await setStatus("running", `Running ${next.task.type}:${next.task.target}`);
    await saveLastTask(next.task);
    await browseTaskUrl(settings, next.task);
    const result = await processTask(settings, next.task);

    await fetchJson(settings, `/api/extension/task/${encodeURIComponent(next.task.id)}/complete`, {
      method: "POST",
      body: {
        exhausted: result.exhausted,
        reachedKnown: result.reachedKnown,
      },
    });

    await setStatus("complete", `Completed ${next.task.target}; posts=${result.postsProcessed}; pages=${result.pagesScanned}`);
    chrome.action.setBadgeText({ text: "ok" });
    return "complete";
  } catch (error) {
    const message = getErrorMessage(error);
    await setStatus("error", message);
    chrome.action.setBadgeText({ text: "err" });
    throw error;
  } finally {
    running = false;
  }
}

async function processTask(settings: ExtensionSettings, task: ExtensionTask) {
  let after: string | null = null;
  let lastResult: IngestResponse = {
    after: null,
    shouldContinue: false,
    exhausted: false,
    reachedKnown: false,
    pagesScanned: 0,
    rawPostsSeen: 0,
    postsProcessed: 0,
    completionsFound: 0,
  };

  try {
    for (let page = 1; page <= task.maxPages; page++) {
      const jsonUrl = withAfter(task.jsonUrl, after);
      const listing = await fetchRedditListing(jsonUrl);

      lastResult = await fetchJson<IngestResponse>(settings, `/api/extension/task/${encodeURIComponent(task.id)}/ingest`, {
        method: "POST",
        body: {
          listing,
          page,
          sourceUrl: jsonUrl,
        },
      });

      await setStatus(
        "running",
        `Running ${task.target}; page=${lastResult.pagesScanned}; posts=${lastResult.postsProcessed}; after=${lastResult.after ?? "none"}`,
      );

      after = lastResult.after;
      if (!lastResult.shouldContinue) break;
    }

    return lastResult;
  } catch (error) {
    await fetchJson(settings, `/api/extension/task/${encodeURIComponent(task.id)}/complete`, {
      method: "POST",
      body: { error: getErrorMessage(error) },
    }).catch(() => undefined);
    throw error;
  }
}

async function browseTaskUrl(settings: ExtensionSettings, task: ExtensionTask) {
  const tabId = settings.workerTabId;

  if (tabId) {
    try {
      await chrome.tabs.update(tabId, { url: task.url, active: false });
      return;
    } catch {
      // The old tab may have been closed. Create a fresh worker tab below.
    }
  }

  const tabs = await chrome.tabs.query({ url: ["https://www.reddit.com/*", "https://old.reddit.com/*"] });
  const existingTab = tabs.find((tab) => typeof tab.id === "number");

  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { url: task.url, active: false });
    await chrome.storage.local.set({ workerTabId: existingTab.id });
    return;
  }

  const tab = await chrome.tabs.create({ url: task.url, active: false });
  if (tab.id) await chrome.storage.local.set({ workerTabId: tab.id });
}

async function fetchRedditListing(url: string) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Reddit returned ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchJson<T>(settings: ExtensionSettings, pathname: string, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}${pathname}`, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = isRecord(json) && typeof json.error === "string" ? json.error : `API returned ${response.status}`;
    throw new Error(message);
  }

  return json as T;
}

function withAfter(url: string, after: string | null) {
  const next = new URL(url);
  if (after) next.searchParams.set("after", after);
  next.searchParams.set("limit", next.searchParams.get("limit") ?? "100");
  next.searchParams.set("raw_json", "1");
  return next.toString();
}

async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get<Record<string, unknown>>(null);
  return {
    apiBaseUrl: typeof stored.apiBaseUrl === "string" ? stored.apiBaseUrl : DEFAULT_SETTINGS.apiBaseUrl,
    pollSeconds: typeof stored.pollSeconds === "number" ? Math.max(10, stored.pollSeconds) : DEFAULT_SETTINGS.pollSeconds,
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_SETTINGS.enabled,
    workerTabId: typeof stored.workerTabId === "number" ? stored.workerTabId : undefined,
    installId: typeof stored.installId === "string" ? stored.installId : undefined,
  };
}

async function ensureInstallId(settings: ExtensionSettings) {
  if (settings.installId) return settings.installId;

  const installId = crypto.randomUUID();
  await chrome.storage.local.set({ installId });
  settings.installId = installId;
  return installId;
}

function schedule(pollSeconds: number) {
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 0.1,
    periodInMinutes: Math.max(10, pollSeconds) / 60,
  });
}

async function setStatus(status: string, message: string) {
  await chrome.storage.local.set({
    status,
    statusMessage: message,
    statusUpdatedAt: new Date().toISOString(),
  });
  chrome.action.setTitle({ title: `PaidPolitely Worker: ${message}` });
}

async function saveLastTask(task: ExtensionTask) {
  await chrome.storage.local.set({
    lastTask: `${task.type}:${task.target}`,
    lastTaskUrl: task.url,
    lastTaskAt: new Date().toISOString(),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

void initialise();
