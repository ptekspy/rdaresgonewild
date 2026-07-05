export {};

type CrawlMode = "system" | "backfill" | "current";
type ExtensionSort = "best" | "new";

interface ExtensionSettings {
  apiBaseUrl: string;
  pollSeconds: number;
  enabled: boolean;
  installId?: string;
}

interface ExtensionTask {
  id: string;
  type: string;
  target: string;
  url: string;
  jsonUrl: string;
  scope: "home" | "subreddit" | "user";
  sort?: ExtensionSort;
  subreddit?: string;
  username?: string;
  maxPages: number;
  stopAtKnown: boolean;
  requiresLoggedInReddit: boolean;
  mode?: CrawlMode;
}

interface StartTaskResponse {
  task: ExtensionTask | null;
  idle?: boolean;
  message?: string;
}

interface JsonIngestResponse {
  accepted: number;
  buffered: number;
  flushed: boolean;
  savedPosts: number;
  completionsFound: number;
  totalBufferedPosts: number;
}

interface ExtensionJsonPost {
  id: string;
  name: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  link_flair_text: string | null;
  score: number;
  ups: number;
  upvoteCount: number | null;
  upvote_ratio: number | null;
  num_comments: number;
  shareCount: number | null;
  share_count: number | null;
  crosspostCount: number;
  num_crossposts: number;
  mediaUrls: string[];
  imageUrls: string[];
  videoUrls: string[];
  embedUrls: string[];
  tags: string[];
  postType?: string | null;
  outboundUrl?: string | null;
  thumbnail?: string | null;
  thumbnailUrl?: string | null;
  url: string;
  url_overridden_by_dest?: string | null;
  permalink: string;
  created_utc: number;
  scrapedAt: string;
  sourceUrl: string;
  subredditNsfw: boolean;
  nsfw: boolean;
  over18: boolean;
}

interface HarvestResult {
  posts: ExtensionJsonPost[];
  scrollTop: number;
  scrollHeight: number;
  viewportHeight: number;
  atBottom: boolean;
  pageNsfw: boolean;
}

interface ModeStats {
  status: "idle" | "running" | "stopping" | "stopped" | "complete" | "error";
  mode: CrawlMode;
  taskTarget?: string;
  taskUrl?: string;
  scrollPasses: number;
  postsSeen: number;
  newPosts: number;
  batchesSent: number;
  apiBuffered: number;
  savedPosts: number;
  completionsFound: number;
  heightStableRounds: number;
  noNewRounds: number;
  bottomRounds: number;
  endDetected: boolean;
  stopRequested: boolean;
  reason?: string;
  updatedAt: string;
}

interface ActiveRun {
  id: string;
  mode: CrawlMode;
  windowId?: number;
  stopped: boolean;
}

const CLIENT_VERSION = "0.5.0-reset-modes";
const CURRENT_PAGE_ALARM = "paidpolitely-current-page-hourly";
const MAX_CRAWL_MS = 45 * 60 * 1000;
const NO_NEW_END_ROUNDS = 20;
const HEIGHT_STABLE_END_ROUNDS = 12;
const BOTTOM_END_ROUNDS = 12;
const SCROLL_SLEEP_MS = 900;

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
] as const;

const SYSTEM_SORTS: ExtensionSort[] = ["best", "new"];

const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: "http://localhost:8788",
  pollSeconds: 30,
  enabled: true,
};

const activeRuns = new Map<CrawlMode, ActiveRun>();

chrome.runtime.onInstalled.addListener(() => {
  void initialise();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CURRENT_PAGE_ALARM) {
    void runCurrentPageWatch();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const typed = isRecord(message) ? message : {};

  if (typed.type === "PAIDPOLITELY_START_MODE") {
    const mode = readMode(typed.mode);
    void startMode(mode)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  if (typed.type === "PAIDPOLITELY_STOP_MODE") {
    const mode = readMode(typed.mode);
    void stopMode(mode)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  if (typed.type === "PAIDPOLITELY_STOP_ALL") {
    void stopAllModes()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  return undefined;
});

async function initialise() {
  const settings = await getSettings();
  await ensureInstallId(settings);
  await chrome.storage.local.set({ stop_system: false, stop_backfill: false, stop_current: false });
  await setGlobalStatus("ready", "Ready");
}

async function startMode(mode: CrawlMode) {
  if (activeRuns.has(mode)) return `${mode}-already-running`;

  const settings = await getSettings();
  if (!settings.enabled) {
    await setGlobalStatus("disabled", "Worker disabled");
    return "disabled";
  }

  await ensureInstallId(settings);
  await chrome.storage.local.set({ [`stop_${mode}`]: false });

  const run: ActiveRun = { id: crypto.randomUUID(), mode, stopped: false };
  activeRuns.set(mode, run);

  void runMode(settings, run).catch((error) => {
    void setModeStats(mode, { status: "error", reason: getErrorMessage(error) });
    void setGlobalStatus("error", `${mode}: ${getErrorMessage(error)}`);
  }).finally(() => {
    activeRuns.delete(mode);
  });

  await setGlobalStatus("running", `${labelMode(mode)} started`);
  return `${mode}-started`;
}

async function runMode(settings: ExtensionSettings, run: ActiveRun) {
  if (run.mode === "system") return runSystemMode(settings, run);
  if (run.mode === "backfill") return runBackfillMode(settings, run);
  return runCurrentMode(settings, run, true);
}

async function runSystemMode(settings: ExtensionSettings, run: ActiveRun) {
  await resetModeStats(run.mode);

  for (const subreddit of SYSTEM_SUBREDDITS) {
    for (const sort of SYSTEM_SORTS) {
      if (await isStopRequested(run)) break;
      const response = await startTask(settings, { mode: "system", subreddit, sort });
      if (!response.task) continue;
      await crawlTask(settings, response.task, run);
    }
  }

  const stopped = await isStopRequested(run);
  await setModeStats(run.mode, { status: stopped ? "stopped" : "complete", stopRequested: stopped, reason: stopped ? "Stopped by user" : "System subreddit pass complete" });
}

async function runBackfillMode(settings: ExtensionSettings, run: ActiveRun) {
  await resetModeStats(run.mode);

  for (;;) {
    if (await isStopRequested(run)) break;

    const response = await startTask(settings, { mode: "backfill" });
    if (!response.task) {
      await setModeStats(run.mode, { status: "idle", reason: response.message ?? "No NSFW subreddits to backfill yet" });
      await sleep(30_000);
      continue;
    }

    await crawlTask(settings, response.task, run);
  }

  await setModeStats(run.mode, { status: "stopped", stopRequested: true, reason: "Stopped by user" });
}

async function runCurrentMode(settings: ExtensionSettings, run: ActiveRun, fromUserClick: boolean) {
  await resetModeStats(run.mode);

  const url = fromUserClick ? await getActiveRedditUrl() : await getStoredCurrentPageUrl();
  if (!url) throw new Error("Current mode needs an active reddit.com tab");

  await chrome.storage.local.set({ currentPageWatchUrl: url, currentPageWatchEnabled: true });
  const response = await startTask(settings, { mode: "current", url });
  if (!response.task) throw new Error(response.message ?? "Could not start current-page task");

  await crawlTask(settings, response.task, run);

  const stopped = await isStopRequested(run);
  if (stopped) {
    await chrome.storage.local.set({ currentPageWatchEnabled: false });
    await chrome.alarms.clear(CURRENT_PAGE_ALARM);
    await setModeStats(run.mode, { status: "stopped", stopRequested: true, reason: "Current-page watch stopped" });
    return;
  }

  chrome.alarms.create(CURRENT_PAGE_ALARM, { delayInMinutes: 60 });
  await setModeStats(run.mode, { status: "complete", reason: "Current page crawled; recrawl scheduled in 1 hour" });
}

async function runCurrentPageWatch() {
  const stored = await chrome.storage.local.get<Record<string, unknown>>(["currentPageWatchEnabled", "currentPageWatchUrl"]);
  if (stored.currentPageWatchEnabled !== true || typeof stored.currentPageWatchUrl !== "string") return;
  if (activeRuns.has("current")) return;

  const settings = await getSettings();
  const run: ActiveRun = { id: crypto.randomUUID(), mode: "current", stopped: false };
  activeRuns.set("current", run);
  await chrome.storage.local.set({ stop_current: false });

  try {
    await runCurrentMode(settings, run, false);
  } finally {
    activeRuns.delete("current");
  }
}

async function stopMode(mode: CrawlMode) {
  await chrome.storage.local.set({ [`stop_${mode}`]: true });
  const run = activeRuns.get(mode);
  if (run) run.stopped = true;
  if (mode === "current") {
    await chrome.storage.local.set({ currentPageWatchEnabled: false });
    await chrome.alarms.clear(CURRENT_PAGE_ALARM);
  }
  await setModeStats(mode, { status: "stopping", stopRequested: true, reason: "Stop requested" });
}

async function stopAllModes() {
  await Promise.all([stopMode("system"), stopMode("backfill"), stopMode("current")]);
}

async function crawlTask(settings: ExtensionSettings, task: ExtensionTask, run: ActiveRun) {
  const seen = new Set<string>();
  let scrollPasses = 0;
  let batchesSent = 0;
  let sentPosts = 0;
  let savedPosts = 0;
  let completionsFound = 0;
  let apiBuffered = 0;
  let noNewRounds = 0;
  let heightStableRounds = 0;
  let bottomRounds = 0;
  let lastHeight = 0;
  let endDetected = false;
  let stopped = false;
  const startedAt = Date.now();

  await setModeStats(run.mode, {
    status: "running",
    taskTarget: task.target,
    taskUrl: task.url,
    scrollPasses,
    postsSeen: 0,
    newPosts: 0,
    batchesSent,
    apiBuffered,
    savedPosts,
    completionsFound,
    heightStableRounds,
    noNewRounds,
    bottomRounds,
    endDetected,
    stopRequested: false,
    reason: undefined,
  });

  const tabId = await browseTaskUrl(task, run);
  await waitForTabComplete(tabId, 30_000).catch(() => undefined);
  await sleep(1_500);

  for (;;) {
    stopped = await isStopRequested(run);
    if (stopped) break;

    const harvest = await harvestVisiblePosts(tabId, task);
    const newPosts: ExtensionJsonPost[] = [];

    for (const post of harvest.posts) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      newPosts.push(post);
    }

    if (newPosts.length > 0) {
      noNewRounds = 0;
      const response = await sendJsonPosts(settings, task, newPosts);
      batchesSent += 1;
      sentPosts += response.accepted;
      savedPosts += response.savedPosts;
      completionsFound += response.completionsFound;
      apiBuffered = response.totalBufferedPosts;
    } else {
      noNewRounds += 1;
    }

    if (lastHeight > 0 && harvest.scrollHeight <= lastHeight + 10) {
      heightStableRounds += 1;
    } else {
      heightStableRounds = 0;
      lastHeight = harvest.scrollHeight;
    }

    bottomRounds = harvest.atBottom ? bottomRounds + 1 : 0;
    endDetected = noNewRounds >= NO_NEW_END_ROUNDS && heightStableRounds >= HEIGHT_STABLE_END_ROUNDS && bottomRounds >= BOTTOM_END_ROUNDS;

    await setModeStats(run.mode, {
      status: "running",
      taskTarget: task.target,
      taskUrl: task.url,
      scrollPasses,
      postsSeen: seen.size,
      newPosts: newPosts.length,
      batchesSent,
      apiBuffered,
      savedPosts,
      completionsFound,
      heightStableRounds,
      noNewRounds,
      bottomRounds,
      endDetected,
      stopRequested: false,
      reason: endDetected ? "Lazy-load appears exhausted" : `pageNsfw=${harvest.pageNsfw}`,
    });

    await setGlobalStatus(
      "running",
      `${labelMode(run.mode)} ${task.target}: seen=${seen.size}, new=${newPosts.length}, bottom=${bottomRounds}/${BOTTOM_END_ROUNDS}, idle=${noNewRounds}/${NO_NEW_END_ROUNDS}`,
    );

    if (endDetected) break;
    if (Date.now() - startedAt > MAX_CRAWL_MS) {
      endDetected = true;
      await setModeStats(run.mode, { endDetected: true, reason: "Safety timeout reached" });
      break;
    }

    await scrollPage(tabId);
    scrollPasses += 1;
    await sleep(SCROLL_SLEEP_MS);
  }

  await fetchJson(settings, `/api/extension/task/${encodeURIComponent(task.id)}/complete`, {
    method: "POST",
    body: { exhausted: endDetected, reachedKnown: false, stopped },
  });

  await setModeStats(run.mode, {
    status: stopped ? "stopped" : "complete",
    taskTarget: task.target,
    taskUrl: task.url,
    postsSeen: seen.size,
    batchesSent,
    savedPosts,
    completionsFound,
    endDetected,
    stopRequested: stopped,
    reason: stopped ? "Stopped by user" : "Lazy-load exhausted",
  });

  return { postsSeen: seen.size, sentPosts, savedPosts, completionsFound, endDetected, stopped };
}

async function startTask(settings: ExtensionSettings, body: Record<string, unknown>) {
  return fetchJson<StartTaskResponse>(settings, "/api/extension/task/start", {
    method: "POST",
    body: {
      ...body,
      installId: settings.installId,
      clientVersion: CLIENT_VERSION,
    },
  });
}

async function sendJsonPosts(settings: ExtensionSettings, task: ExtensionTask, posts: ExtensionJsonPost[]) {
  return fetchJson<JsonIngestResponse>(settings, `/api/extension/task/${encodeURIComponent(task.id)}/ingest-json`, {
    method: "POST",
    body: {
      sourceUrl: task.url,
      scrapeMode: "extension-json-live",
      clientVersion: CLIENT_VERSION,
      posts,
    },
  });
}

async function harvestVisiblePosts(tabId: number, task: ExtensionTask): Promise<HarvestResult> {
  const [injection] = await chrome.scripting.executeScript<HarvestResult>({
    target: { tabId },
    args: [task],
    func: (injectedTask: ExtensionTask) => {
      const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
      const absoluteUrl = (href: string | null | undefined) => {
        if (!href) return "";
        try {
          return new URL(href, location.origin).toString();
        } catch {
          return "";
        }
      };
      const decodeHtml = (value: string) => {
        const textarea = document.createElement("textarea");
        textarea.innerHTML = value;
        return textarea.value;
      };
      const idFromPermalink = (href: string) => href.match(/\/comments\/([A-Za-z0-9_]+)/i)?.[1] ?? "";
      const usernameFromHref = (href: string) => href.match(/\/(?:user|u)\/([^/?#]+)/i)?.[1]?.replace(/[^A-Za-z0-9_-]/g, "") ?? "";
      const subredditFromHref = (href: string) => href.match(/\/r\/([^/?#]+)/i)?.[1] ?? "";
      const numberFromText = (text: string) => {
        const normalised = text.toLowerCase().replace(/,/g, "");
        const match = normalised.match(/([0-9]+(?:\.[0-9]+)?)\s*([km])?/);
        if (!match) return 0;
        const n = Number(match[1]);
        if (!Number.isFinite(n)) return 0;
        if (match[2] === "k") return Math.round(n * 1000);
        if (match[2] === "m") return Math.round(n * 1_000_000);
        return Math.round(n);
      };
      const getText = (root: Element, selectors: string[]) => {
        for (const selector of selectors) {
          const text = clean(root.querySelector(selector)?.textContent);
          if (text) return text;
        }
        return "";
      };
      const getAttr = (root: Element | null, names: string[]) => {
        if (!root) return "";
        for (const name of names) {
          const value = clean(root.getAttribute(name));
          if (value) return value;
        }
        return "";
      };
      const isNsfwText = (value: string) => /\bnsfw\b|adult content|mature content|over 18|18\+/i.test(value);
      const pageText = clean(document.body?.innerText ?? "").slice(0, 60_000);
      const pageNsfw = Boolean(
        isNsfwText(pageText) ||
          document.querySelector('[aria-label*="NSFW" i], [aria-label*="adult" i], [title*="NSFW" i], [title*="adult" i]'),
      );
      const findOverflowMenu = (root: Element) => root.querySelector("shreddit-post-overflow-menu") ?? root.closest("shreddit-post")?.querySelector("shreddit-post-overflow-menu") ?? null;
      const findPermalink = (root: Element, overflow: Element | null) => {
        const attr = getAttr(root, ["permalink", "content-href"]) || getAttr(overflow, ["permalink"]);
        if (attr.includes("/comments/")) return absoluteUrl(attr);
        const titleLink = root.querySelector<HTMLAnchorElement>('[slot="title"][href*="/comments/"]');
        if (titleLink) return absoluteUrl(titleLink.getAttribute("href"));
        return absoluteUrl(root.querySelector<HTMLAnchorElement>('a[href*="/comments/"]')?.getAttribute("href"));
      };
      const findAuthor = (root: Element, overflow: Element | null) => {
        const attr = getAttr(root, ["author", "author-name"]) || getAttr(overflow, ["author-name"]);
        if (attr) return attr.replace(/^u\//i, "");
        const link = root.querySelector<HTMLAnchorElement>('a[href*="/user/"], a[href*="/u/"]');
        return usernameFromHref(link?.href ?? link?.getAttribute("href") ?? "");
      };
      const findSubreddit = (root: Element, overflow: Element | null, permalink: string) => {
        const attr = getAttr(root, ["subreddit-prefixed-name", "subreddit"]) || getAttr(overflow, ["subreddit-prefixed-name", "subreddit"]);
        if (attr) return attr.replace(/^r\//i, "");
        const link = root.querySelector<HTMLAnchorElement>('a[href*="/r/"]');
        return subredditFromHref(link?.href ?? link?.getAttribute("href") ?? "") || subredditFromHref(permalink) || injectedTask.subreddit || "home";
      };
      const findCreatedUtc = (root: Element) => {
        const datetime = root.querySelector<HTMLTimeElement>("time[datetime]")?.getAttribute("datetime");
        if (datetime) {
          const parsed = Date.parse(datetime);
          if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
        }
        const ts = root.querySelector("faceplate-timeago[ts]")?.getAttribute("ts");
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
      const collectUrls = (root: Element) => {
        const imageUrls = new Set<string>();
        const videoUrls = new Set<string>();
        const embedUrls = new Set<string>();
        const mediaUrls = new Set<string>();
        const externalUrls = new Set<string>();
        const addMedia = (url: string, bucket?: Set<string>) => {
          const absolute = absoluteUrl(url);
          if (!absolute) return;
          if (/avatar|emoji|icon|snoovatar|styles\.redditmedia/i.test(absolute)) return;
          mediaUrls.add(absolute);
          bucket?.add(absolute);
        };
        for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img[src], faceplate-img[src]"))) {
          addMedia(img.currentSrc || img.getAttribute("src") || "", imageUrls);
        }
        for (const source of Array.from(root.querySelectorAll<HTMLSourceElement>("source[src]"))) {
          const src = source.src || source.getAttribute("src") || "";
          addMedia(src, /\.(mp4|m3u8|webm)(\?|$)/i.test(src) ? videoUrls : imageUrls);
        }
        for (const video of Array.from(root.querySelectorAll<HTMLVideoElement>("video[src]"))) {
          addMedia(video.src || video.getAttribute("src") || "", videoUrls);
        }
        for (const embed of Array.from(root.querySelectorAll("shreddit-embed[html], iframe[src]"))) {
          const direct = embed.getAttribute("src");
          if (direct) addMedia(direct, embedUrls);
          const html = embed.getAttribute("html");
          if (html) {
            const match = decodeHtml(html).match(/\ssrc=["']([^"']+)["']/i);
            if (match?.[1]) addMedia(match[1], embedUrls);
          }
        }
        for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
          const href = absoluteUrl(link.getAttribute("href"));
          if (!href) continue;
          if (/\/comments\/|\/user\/|\/u\/|\/r\//i.test(href)) continue;
          if (/reddit\.com\/media|i\.redd\.it|preview\.redd\.it|v\.redd\.it|redgifs\.com|imgur\.com/i.test(href)) addMedia(href, externalUrls);
        }
        for (const url of externalUrls) mediaUrls.add(url);
        return { mediaUrls: [...mediaUrls], imageUrls: [...imageUrls], videoUrls: [...videoUrls], embedUrls: [...embedUrls], outboundUrl: [...externalUrls][0] ?? [...embedUrls][0] ?? [...videoUrls][0] ?? [...imageUrls][0] ?? null };
      };
      const collectTags = (root: Element, overflow: Element | null, flair: string, postType: string | null, nsfw: boolean) => {
        const tags = new Set<string>();
        if (flair) tags.add(flair);
        if (postType) tags.add(postType);
        if (nsfw) tags.add("NSFW");
        for (const selector of ['[aria-label*="NSFW" i]', '[title*="NSFW" i]', 'shreddit-post-flair', '[slot="post-flair"]']) {
          for (const element of Array.from(root.querySelectorAll(selector))) {
            const text = clean(element.textContent || element.getAttribute("aria-label") || element.getAttribute("title"));
            if (text) tags.add(text);
          }
        }
        const overflowAttrs = ["post-type", "subreddit-prefixed-name"].map((name) => getAttr(overflow, [name])).filter(Boolean);
        for (const attr of overflowAttrs) tags.add(attr);
        return [...tags];
      };
      const extractPost = (root: Element): ExtensionJsonPost | null => {
        const overflow = findOverflowMenu(root);
        const permalink = findPermalink(root, overflow);
        const id = getAttr(root, ["post-id", "thingid", "data-fullname"]).replace(/^t3_/i, "") || getAttr(overflow, ["post-id", "source-id"]).replace(/^t3_/i, "") || idFromPermalink(permalink);
        if (!id) return null;
        const title = getAttr(root, ["post-title", "aria-label"]) || getText(root, ['[slot="title"]', '[data-testid="post-title"]', '[data-click-id="body"] h3', "h1", "h2", "h3", "a[id^='post-title']"]);
        if (!title) return null;
        const author = findAuthor(root, overflow);
        if (!/^[A-Za-z0-9_-]{3,20}$/.test(author)) return null;
        const subreddit = findSubreddit(root, overflow, permalink);
        const flair = getText(root, ['[data-testid="post-flair"]', '[slot="post-flair"]', "shreddit-post-flair", ".flair"]);
        const postType = getAttr(root, ["post-type"]) || getAttr(overflow, ["post-type"]) || null;
        const rootText = clean(root.textContent).slice(0, 12_000);
        const rootNsfw = Boolean(
          pageNsfw ||
            isNsfwText(rootText) ||
            ["over-18", "is-nsfw", "nsfw"].some((name) => root.hasAttribute(name) || overflow?.hasAttribute(name)) ||
            getAttr(root, ["over-18", "is-nsfw", "nsfw"]) === "true" ||
            getAttr(overflow, ["over-18", "is-nsfw", "nsfw"]) === "true",
        );
        const scoreText = getAttr(root, ["score"]) || getAttr(overflow, ["score"]) || getText(root, ["[score]", "[data-testid='post-vote-count']", "shreddit-score", "[aria-label*='upvote']"]);
        const commentText = getAttr(root, ["comment-count"]) || getAttr(overflow, ["comment-count"]) || getText(root, ['a[href*="/comments/"] span', '[data-testid="comment-count"]', '[aria-label*="comment"]']);
        const media = collectUrls(root);
        const score = numberFromText(scoreText);
        const commentCount = numberFromText(commentText);
        const canonicalPermalink = permalink || absoluteUrl(`/r/${subreddit}/comments/${id}/`);
        const tags = collectTags(root, overflow, flair, postType, rootNsfw);
        return {
          id,
          name: `t3_${id}`,
          subreddit,
          title,
          selftext: getText(root, ["[slot='text-body']", "[data-testid='post-selftext']", ".md"]) || "",
          author,
          link_flair_text: flair || null,
          score,
          ups: score,
          upvoteCount: score,
          upvote_ratio: null,
          num_comments: commentCount,
          shareCount: null,
          share_count: null,
          crosspostCount: 0,
          num_crossposts: 0,
          mediaUrls: media.mediaUrls,
          imageUrls: media.imageUrls,
          videoUrls: media.videoUrls,
          embedUrls: media.embedUrls,
          tags,
          postType,
          outboundUrl: media.outboundUrl,
          thumbnail: media.imageUrls[0] ?? media.mediaUrls[0] ?? null,
          thumbnailUrl: media.imageUrls[0] ?? media.mediaUrls[0] ?? null,
          url: media.outboundUrl ?? media.mediaUrls[0] ?? canonicalPermalink,
          url_overridden_by_dest: media.outboundUrl ?? media.mediaUrls[0] ?? canonicalPermalink,
          permalink: canonicalPermalink,
          created_utc: findCreatedUtc(root),
          scrapedAt: new Date().toISOString(),
          sourceUrl: location.href,
          subredditNsfw: rootNsfw,
          nsfw: rootNsfw,
          over18: rootNsfw,
        };
      };
      const roots = [...Array.from(document.querySelectorAll("shreddit-post")), ...Array.from(document.querySelectorAll('[data-testid="post-container"]')), ...Array.from(document.querySelectorAll("article"))];
      for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/comments/"]'))) {
        const root = link.closest("shreddit-post, article, [data-testid='post-container']");
        if (root && !roots.includes(root)) roots.push(root);
      }
      const posts = new Map<string, ExtensionJsonPost>();
      for (const root of roots) {
        const post = extractPost(root);
        if (post) posts.set(post.id, post);
      }
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0, document.documentElement.offsetHeight, document.body?.offsetHeight ?? 0);
      const atBottom = scrollTop + viewportHeight >= scrollHeight - Math.max(600, viewportHeight * 0.5);
      return { posts: [...posts.values()], scrollTop, scrollHeight, viewportHeight, atBottom, pageNsfw };
    },
  });
  const result = injection?.result;
  if (!result || !Array.isArray(result.posts)) throw new Error("Page JSON crawl failed: no harvest result returned");
  return result;
}

async function scrollPage(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      window.scrollBy({ top: Math.max(window.innerHeight * 3, 30_000), behavior: "smooth" });
    },
  });
}

async function browseTaskUrl(task: ExtensionTask, run: ActiveRun) {
  if (run.windowId) {
    try {
      const windowInfo = await chrome.windows.get(run.windowId, { populate: true });
      const tab = windowInfo.tabs?.find((candidate) => typeof candidate.id === "number");
      if (tab?.id) {
        const updated = await chrome.tabs.update(tab.id, { url: task.url, active: true });
        return updated.id ?? tab.id;
      }
    } catch {
      run.windowId = undefined;
    }
  }
  const windowInfo = await chrome.windows.create({ url: task.url, focused: true, type: "normal" });
  run.windowId = windowInfo.id;
  const tabId = windowInfo.tabs?.find((tab) => typeof tab.id === "number")?.id;
  if (!tabId) throw new Error("Could not create Reddit worker window");
  return tabId;
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

async function getActiveRedditUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url ?? "";
  return /^https:\/\/(?:www\.|old\.)?reddit\.com\//i.test(url) ? url : "";
}

async function getStoredCurrentPageUrl() {
  const stored = await chrome.storage.local.get<Record<string, unknown>>(["currentPageWatchUrl"]);
  return typeof stored.currentPageWatchUrl === "string" ? stored.currentPageWatchUrl : "";
}

async function isStopRequested(run: ActiveRun) {
  if (run.stopped) return true;
  const stored = await chrome.storage.local.get<Record<string, unknown>>([`stop_${run.mode}`]);
  return stored[`stop_${run.mode}`] === true;
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

async function setGlobalStatus(status: string, message: string) {
  await chrome.storage.local.set({ status, statusMessage: message, statusUpdatedAt: new Date().toISOString() });
  chrome.action.setTitle({ title: `PaidPolitely Worker: ${message}` });
}

async function setModeStats(mode: CrawlMode, stats: Partial<ModeStats>) {
  const current = await getModeStats(mode);
  await chrome.storage.local.set({
    [`crawlStats_${mode}`]: {
      ...current,
      ...stats,
      mode,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function resetModeStats(mode: CrawlMode) {
  await setModeStats(mode, {
    status: "running",
    scrollPasses: 0,
    postsSeen: 0,
    newPosts: 0,
    batchesSent: 0,
    apiBuffered: 0,
    savedPosts: 0,
    completionsFound: 0,
    heightStableRounds: 0,
    noNewRounds: 0,
    bottomRounds: 0,
    endDetected: false,
    stopRequested: false,
    reason: undefined,
  });
}

async function getModeStats(mode: CrawlMode): Promise<ModeStats> {
  const stored = await chrome.storage.local.get<Record<string, unknown>>([`crawlStats_${mode}`]);
  const rawStats = stored[`crawlStats_${mode}`];
  const stats: Record<string, unknown> = isRecord(rawStats) ? rawStats : {};
  return {
    status: typeof stats.status === "string" ? (stats.status as ModeStats["status"]) : "idle",
    mode,
    taskTarget: typeof stats.taskTarget === "string" ? stats.taskTarget : undefined,
    taskUrl: typeof stats.taskUrl === "string" ? stats.taskUrl : undefined,
    scrollPasses: numberValue(stats.scrollPasses),
    postsSeen: numberValue(stats.postsSeen),
    newPosts: numberValue(stats.newPosts),
    batchesSent: numberValue(stats.batchesSent),
    apiBuffered: numberValue(stats.apiBuffered),
    savedPosts: numberValue(stats.savedPosts),
    completionsFound: numberValue(stats.completionsFound),
    heightStableRounds: numberValue(stats.heightStableRounds),
    noNewRounds: numberValue(stats.noNewRounds),
    bottomRounds: numberValue(stats.bottomRounds),
    endDetected: stats.endDetected === true,
    stopRequested: stats.stopRequested === true,
    reason: typeof stats.reason === "string" ? stats.reason : undefined,
    updatedAt: typeof stats.updatedAt === "string" ? stats.updatedAt : new Date().toISOString(),
  };
}

function readMode(value: unknown): CrawlMode {
  if (value === "system" || value === "backfill" || value === "current") return value;
  throw new Error("mode must be system, backfill, or current");
}

function labelMode(mode: CrawlMode) {
  if (mode === "system") return "System";
  if (mode === "backfill") return "Backfill";
  return "Current page";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

void initialise();
