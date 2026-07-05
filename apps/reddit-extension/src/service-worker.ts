export {};

interface ExtensionSettings {
  apiBaseUrl: string;
  pollSeconds: number;
  enabled: boolean;
  workerTabId?: number;
  installId?: string;
  forceMainQueue: boolean;
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

interface ScrapedListing {
  data: {
    children: Array<{ data: Record<string, unknown> }>;
    after: null;
    before: null;
  };
}

const ALARM_NAME = "paidpolitely-extension-worker";
const CLIENT_VERSION = "0.2.0-scroll-scrape";

const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: "http://localhost:8787",
  pollSeconds: 30,
  enabled: true,
  forceMainQueue: false,
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

    const forceMainQueue = settings.forceMainQueue;

    const next = await fetchJson<NextTaskResponse>(settings, "/api/extension/task/next", {
      method: "POST",
      body: {
        installId: settings.installId,
        clientVersion: CLIENT_VERSION,
        forceMainQueue,
      },
    });

    if (forceMainQueue) {
      await chrome.storage.local.set({ forceMainQueue: false });
    }

    if (!next.task) {
      await setStatus("idle", `Idle. Retrying in ${Math.round((next.retryAfterMs ?? settings.pollSeconds * 1000) / 1000)}s.`);
      chrome.action.setBadgeText({ text: "idle" });
      return "idle";
    }

    await setStatus(
      "running",
      `${forceMainQueue ? "Forced core start. " : ""}Browsing ${next.task.type}:${next.task.target}`,
    );
    await saveLastTask(next.task);

    const tabId = await browseTaskUrl(settings, next.task);
    await waitForTabComplete(tabId, 30_000).catch(() => undefined);

    const result = await processTaskByScrapingPage(settings, next.task, tabId);

    await fetchJson(settings, `/api/extension/task/${encodeURIComponent(next.task.id)}/complete`, {
      method: "POST",
      body: {
        exhausted: result.exhausted,
        reachedKnown: result.reachedKnown,
      },
    });

    await setStatus("complete", `Completed ${next.task.target}; scraped=${result.rawPostsSeen}; imported=${result.postsProcessed}`);
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

async function processTaskByScrapingPage(settings: ExtensionSettings, task: ExtensionTask, tabId: number) {
  const listing = await scrollAndScrapeListing(tabId, task);

  const result = await fetchJson<IngestResponse>(settings, `/api/extension/task/${encodeURIComponent(task.id)}/ingest`, {
    method: "POST",
    body: {
      listing,
      page: 1,
      sourceUrl: task.url,
      scrapeMode: "dom-scroll",
    },
  });

  await setStatus(
    "running",
    `Scraped ${listing.data.children.length} loaded posts from ${task.target}; imported=${result.postsProcessed}`,
  );

  return result;
}

async function browseTaskUrl(settings: ExtensionSettings, task: ExtensionTask) {
  const existingTabId = settings.workerTabId;

  if (existingTabId) {
    try {
      const tab = await chrome.tabs.update(existingTabId, { url: task.url, active: true });
      return tab.id ?? existingTabId;
    } catch {
      // Existing worker tab was closed.
    }
  }

  const tabs = await chrome.tabs.query({ url: ["https://www.reddit.com/*", "https://old.reddit.com/*"] });
  const existingTab = tabs.find((tab) => typeof tab.id === "number");

  if (existingTab?.id) {
    const tab = await chrome.tabs.update(existingTab.id, { url: task.url, active: true });
    await chrome.storage.local.set({ workerTabId: existingTab.id });
    return tab.id ?? existingTab.id;
  }

  const tab = await chrome.tabs.create({ url: task.url, active: true });
  if (!tab.id) throw new Error("Could not create Reddit worker tab");

  await chrome.storage.local.set({ workerTabId: tab.id });
  return tab.id;
}

async function waitForTabComplete(tabId: number, timeoutMs: number) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
  } catch {
    return;
  }

  await new Promise<void>((resolve) => {
    let done = false;

    const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish();
    };

    const timeout = setTimeout(finish, timeoutMs);

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function scrollAndScrapeListing(tabId: number, task: ExtensionTask): Promise<ScrapedListing> {
  const scrollPasses = Math.max(60, Math.min(220, task.maxPages * 60));
  const idleRounds = Math.max(12, Math.min(30, task.maxPages * 7));

  const [injection] = await chrome.scripting.executeScript<ScrapedListing>({
    target: { tabId },
    args: [task, scrollPasses, idleRounds],
    func: async (injectedTask: ExtensionTask, maxScrollPasses: number, maxIdleRounds: number) => {
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const posts = new Map<string, Record<string, unknown>>();

      const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

      const absoluteUrl = (href: string | null | undefined) => {
        if (!href) return "";
        try {
          return new URL(href, location.origin).toString();
        } catch {
          return "";
        }
      };

      const idFromPermalink = (href: string) => {
        const match = href.match(/\/comments\/([A-Za-z0-9_]+)/i);
        return match?.[1] ?? "";
      };

      const usernameFromHref = (href: string) => {
        const match = href.match(/\/(?:user|u)\/([^/?#]+)/i);
        return match?.[1]?.replace(/[^A-Za-z0-9_-]/g, "") ?? "";
      };

      const subredditFromHref = (href: string) => {
        const match = href.match(/\/r\/([^/?#]+)/i);
        return match?.[1] ?? "";
      };

      const numberFromText = (text: string) => {
        const normalised = text.toLowerCase().replace(/,/g, "");
        const match = normalised.match(/([0-9]+(?:\.[0-9]+)?)\s*([km])?/);
        if (!match) return 0;
        const n = Number(match[1]);
        if (!Number.isFinite(n)) return 0;
        if (match[2] === "k") return Math.round(n * 1000);
        if (match[2] === "m") return Math.round(n * 1000000);
        return Math.round(n);
      };

      const getText = (root: Element, selectors: string[]) => {
        for (const selector of selectors) {
          const found = root.querySelector(selector);
          const text = clean(found?.textContent);
          if (text) return text;
        }
        return "";
      };

      const getAttr = (root: Element, names: string[]) => {
        for (const name of names) {
          const value = clean(root.getAttribute(name));
          if (value) return value;
        }
        return "";
      };

      const findPermalink = (root: Element) => {
        const attr = getAttr(root, ["permalink", "content-href"]);
        if (attr.includes("/comments/")) return absoluteUrl(attr);

        const link = root.querySelector<HTMLAnchorElement>('a[href*="/comments/"]');
        return absoluteUrl(link?.getAttribute("href"));
      };

      const findAuthor = (root: Element) => {
        const attr = getAttr(root, ["author"]);
        if (attr) return attr.replace(/^u\//i, "");

        const link = root.querySelector<HTMLAnchorElement>('a[href*="/user/"], a[href*="/u/"]');
        return usernameFromHref(link?.href ?? link?.getAttribute("href") ?? "");
      };

      const findSubreddit = (root: Element, permalink: string) => {
        const attr = getAttr(root, ["subreddit-prefixed-name", "subreddit"]);
        if (attr) return attr.replace(/^r\//i, "");

        const link = root.querySelector<HTMLAnchorElement>('a[href*="/r/"]');
        const fromLink = subredditFromHref(link?.href ?? link?.getAttribute("href") ?? "");
        if (fromLink) return fromLink;

        const fromPermalink = subredditFromHref(permalink);
        if (fromPermalink) return fromPermalink;

        return injectedTask.subreddit ?? "home";
      };

      const findCreatedUtc = (root: Element) => {
        const time = root.querySelector<HTMLTimeElement>("time[datetime]");
        const datetime = time?.getAttribute("datetime");
        if (datetime) {
          const parsed = Date.parse(datetime);
          if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
        }

        const faceplate = root.querySelector("faceplate-timeago[ts]");
        const ts = faceplate?.getAttribute("ts");
        if (ts) {
          const parsed = Date.parse(ts);
          if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
        }

        const created = getAttr(root, ["created-timestamp", "created-utc"]);
        if (created) {
          const numeric = Number(created);
          if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
          const parsed = Date.parse(created);
          if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
        }

        return Math.floor(Date.now() / 1000);
      };

      const findImages = (root: Element) => {
        const urls = new Set<string>();

        for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img[src]"))) {
          const src = absoluteUrl(img.currentSrc || img.src || img.getAttribute("src"));
          if (!src) continue;
          if (/avatar|emoji|icon|snoovatar/i.test(src)) continue;
          urls.add(src);
        }

        for (const source of Array.from(root.querySelectorAll<HTMLSourceElement>("source[src]"))) {
          const src = absoluteUrl(source.src || source.getAttribute("src"));
          if (src) urls.add(src);
        }

        for (const video of Array.from(root.querySelectorAll<HTMLVideoElement>("video[src]"))) {
          const src = absoluteUrl(video.src || video.getAttribute("src"));
          if (src) urls.add(src);
        }

        return [...urls];
      };

      const extractPost = (root: Element) => {
        const permalink = findPermalink(root);
        const id = getAttr(root, ["post-id", "thingid", "data-fullname"]).replace(/^t3_/i, "") || idFromPermalink(permalink);
        if (!id) return null;

        const title =
          getAttr(root, ["post-title", "aria-label"]) ||
          getText(root, [
            '[slot="title"]',
            '[data-testid="post-title"]',
            '[data-click-id="body"] h3',
            "h1",
            "h2",
            "h3",
            "a[id^='post-title']",
          ]);

        if (!title) return null;

        const author = findAuthor(root);
        if (!/^[A-Za-z0-9_-]{3,20}$/.test(author)) return null;

        const subreddit = findSubreddit(root, permalink);
        const flair = getText(root, [
          '[data-testid="post-flair"]',
          '[slot="flair"]',
          "shreddit-post-flair",
          ".flair",
        ]);

        const mediaUrls = findImages(root);
        const scoreText =
          getAttr(root, ["score"]) ||
          getText(root, ["[score]", "[data-testid='post-vote-count']", "shreddit-score", "[aria-label*='upvote']"]);
        const commentText = getText(root, [
          'a[href*="/comments/"] span',
          '[data-testid="comment-count"]',
          '[aria-label*="comment"]',
        ]);

        return {
          id,
          name: `t3_${id}`,
          subreddit,
          title,
          selftext: "",
          author,
          link_flair_text: flair || null,
          score: numberFromText(scoreText),
          ups: numberFromText(scoreText),
          upvote_ratio: null,
          num_comments: numberFromText(commentText),
          share_count: null,
          num_crossposts: 0,
          url: mediaUrls[0] ?? permalink,
          url_overridden_by_dest: mediaUrls[0] ?? permalink,
          thumbnail: mediaUrls[0] ?? "",
          preview: mediaUrls.length
            ? {
                images: [
                  {
                    source: { url: mediaUrls[0] },
                    resolutions: mediaUrls.slice(1).map((url) => ({ url })),
                  },
                ],
              }
            : undefined,
          media: null,
          secure_media: null,
          permalink,
          created_utc: findCreatedUtc(root),
        };
      };

      const harvest = () => {
        const roots = [
          ...Array.from(document.querySelectorAll("shreddit-post")),
          ...Array.from(document.querySelectorAll('[data-testid="post-container"]')),
          ...Array.from(document.querySelectorAll("article")),
        ];

        for (const root of roots) {
          const post = extractPost(root);
          if (post) posts.set(String(post.id), post);
        }
      };

      let idleRounds = 0;
      let lastCount = 0;

      for (let i = 0; i < maxScrollPasses; i++) {
        harvest();

        if (posts.size <= lastCount) {
          idleRounds++;
        } else {
          idleRounds = 0;
          lastCount = posts.size;
        }

        if (idleRounds >= maxIdleRounds && i > 15) break;

        window.scrollBy({
          top: Math.max(window.innerHeight * 0.92, 900),
          behavior: "smooth",
        });

        await sleep(650);
      }

      harvest();

      return {
        data: {
          children: [...posts.values()].map((data) => ({ data })),
          after: null,
          before: null,
        },
      };
    },
  });

  const listing = injection?.result;
  if (!listing || !Array.isArray(listing.data?.children)) {
    throw new Error("Page scrape failed: no listing returned");
  }

  if (listing.data.children.length === 0) {
    throw new Error("Page scrape found 0 posts");
  }

  return listing;
}

async function fetchJson<T>(settings: ExtensionSettings, pathname: string, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}${pathname}`, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();

  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`API returned non-JSON ${response.status}: ${text.slice(0, 160)}`);
  }

  if (!response.ok) {
    const message = isRecord(json) && typeof json.error === "string" ? json.error : `API returned ${response.status}`;
    throw new Error(message);
  }

  return json as T;
}

async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get<Record<string, unknown>>(null);

  return {
    apiBaseUrl: typeof stored.apiBaseUrl === "string" ? stored.apiBaseUrl : DEFAULT_SETTINGS.apiBaseUrl,
    pollSeconds: typeof stored.pollSeconds === "number" ? Math.max(10, stored.pollSeconds) : DEFAULT_SETTINGS.pollSeconds,
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_SETTINGS.enabled,
    workerTabId: typeof stored.workerTabId === "number" ? stored.workerTabId : undefined,
    installId: typeof stored.installId === "string" ? stored.installId : undefined,
    forceMainQueue: typeof stored.forceMainQueue === "boolean" ? stored.forceMainQueue : DEFAULT_SETTINGS.forceMainQueue,
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
