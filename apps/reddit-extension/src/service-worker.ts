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
}

interface HarvestResult {
  posts: ExtensionJsonPost[];
  scrollTop: number;
  scrollHeight: number;
  viewportHeight: number;
  atBottom: boolean;
}

interface CrawlStats {
  status: "idle" | "running" | "stopping" | "stopped" | "complete" | "error";
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

const ALARM_NAME = "paidpolitely-extension-worker";
const CLIENT_VERSION = "0.4.0-json-status-batch";
const MAX_CRAWL_MS = 25 * 60 * 1000;
const NO_NEW_END_ROUNDS = 12;
const HEIGHT_STABLE_END_ROUNDS = 8;
const BOTTOM_END_ROUNDS = 8;

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

  if (typed.type === "PAIDPOLITELY_STOP_NOW") {
    void requestStop()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  return undefined;
});

async function initialise() {
  const settings = await getSettings();
  await ensureInstallId(settings);
  schedule(settings.pollSeconds);
  await chrome.storage.local.set({ stopRequested: false });
  await setStatus("ready", "Worker installed");
}

async function requestStop() {
  await chrome.storage.local.set({ stopRequested: true });
  await setStatus("stopping", "Stop requested. Finishing current flush…");
  const stats = await getCrawlStats();
  await updateCrawlStats({
    ...stats,
    status: "stopping",
    stopRequested: true,
    reason: "Stop requested",
  });
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

    await chrome.storage.local.set({ stopRequested: false });
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
      await updateCrawlStats({
        status: "idle",
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
      });
      chrome.action.setBadgeText({ text: "idle" });
      return "idle";
    }

    await setStatus(
      "running",
      `${forceMainQueue ? "Forced core start. " : ""}Crawling ${next.task.type}:${next.task.target}`,
    );
    await saveLastTask(next.task);

    const tabId = await browseTaskUrl(settings, next.task);
    await waitForTabComplete(tabId, 30_000).catch(() => undefined);

    const result = await crawlRedditPage(settings, next.task, tabId);

    await fetchJson(settings, `/api/extension/task/${encodeURIComponent(next.task.id)}/complete`, {
      method: "POST",
      body: {
        exhausted: result.endDetected,
        reachedKnown: false,
        stopped: result.stopped,
      },
    });

    const finalStatus = result.stopped ? "stopped" : "complete";
    await setStatus(
      finalStatus,
      `${result.stopped ? "Stopped" : "Completed"} ${next.task.target}; seen=${result.postsSeen}; sent=${result.sentPosts}; saved≈${result.savedPosts}`,
    );
    chrome.action.setBadgeText({ text: result.stopped ? "stop" : "ok" });
    return finalStatus;
  } catch (error) {
    const message = getErrorMessage(error);
    await setStatus("error", message);
    await updateCrawlStats({ ...(await getCrawlStats()), status: "error", reason: message });
    chrome.action.setBadgeText({ text: "err" });
    throw error;
  } finally {
    running = false;
  }
}

async function crawlRedditPage(settings: ExtensionSettings, task: ExtensionTask, tabId: number) {
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

  await updateCrawlStats({
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
  });

  for (;;) {
    const stored = await chrome.storage.local.get<Record<string, unknown>>(["stopRequested"]);
    stopped = stored.stopRequested === true;
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

    if (harvest.atBottom) {
      bottomRounds += 1;
    } else {
      bottomRounds = 0;
    }

    endDetected =
      noNewRounds >= NO_NEW_END_ROUNDS &&
      heightStableRounds >= HEIGHT_STABLE_END_ROUNDS &&
      bottomRounds >= BOTTOM_END_ROUNDS;

    await updateCrawlStats({
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
      reason: endDetected ? "Lazy-load appears exhausted" : undefined,
    });

    await setStatus(
      "running",
      `Scrolling ${task.target}: seen=${seen.size}, new=${newPosts.length}, bottom=${bottomRounds}/${BOTTOM_END_ROUNDS}, idle=${noNewRounds}/${NO_NEW_END_ROUNDS}`,
    );

    if (endDetected) break;
    if (Date.now() - startedAt > MAX_CRAWL_MS) {
      endDetected = true;
      await updateCrawlStats({
        ...(await getCrawlStats()),
        endDetected: true,
        reason: "Safety timeout reached",
      });
      break;
    }

    await scrollPage(tabId);
    scrollPasses += 1;
    await sleep(900);
  }

  if (stopped) {
    await updateCrawlStats({
      ...(await getCrawlStats()),
      status: "stopped",
      stopRequested: true,
      reason: "Stopped by user",
    });
  } else {
    await updateCrawlStats({
      ...(await getCrawlStats()),
      status: "complete",
      endDetected: true,
      reason: "Lazy-load exhausted",
    });
  }

  return { postsSeen: seen.size, sentPosts, savedPosts, completionsFound, endDetected, stopped };
}

async function sendJsonPosts(settings: ExtensionSettings, task: ExtensionTask, posts: ExtensionJsonPost[]) {
  const response = await fetchJson<JsonIngestResponse>(settings, `/api/extension/task/${encodeURIComponent(task.id)}/ingest-json`, {
    method: "POST",
    body: {
      sourceUrl: task.url,
      scrapeMode: "extension-json-live",
      clientVersion: CLIENT_VERSION,
      posts,
    },
  });

  return response;
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

      const findOverflowMenu = (root: Element) =>
        root.querySelector("shreddit-post-overflow-menu") ??
        root.closest("shreddit-post")?.querySelector("shreddit-post-overflow-menu") ??
        null;

      const findPermalink = (root: Element, overflow: Element | null) => {
        const attr = getAttr(root, ["permalink", "content-href"]) || getAttr(overflow ?? root, ["permalink"]);
        if (attr.includes("/comments/")) return absoluteUrl(attr);

        const titleLink = root.querySelector<HTMLAnchorElement>('[slot="title"][href*="/comments/"]');
        if (titleLink) return absoluteUrl(titleLink.getAttribute("href"));

        const link = root.querySelector<HTMLAnchorElement>('a[href*="/comments/"]');
        return absoluteUrl(link?.getAttribute("href"));
      };

      const findAuthor = (root: Element, overflow: Element | null) => {
        const attr = getAttr(root, ["author", "author-name"]) || getAttr(overflow ?? root, ["author-name"]);
        if (attr) return attr.replace(/^u\//i, "");

        const link = root.querySelector<HTMLAnchorElement>('a[href*="/user/"], a[href*="/u/"]');
        return usernameFromHref(link?.href ?? link?.getAttribute("href") ?? "");
      };

      const findSubreddit = (root: Element, overflow: Element | null, permalink: string) => {
        const attr =
          getAttr(root, ["subreddit-prefixed-name", "subreddit"]) ||
          getAttr(overflow ?? root, ["subreddit-prefixed-name", "subreddit"]);
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
          const src = absoluteUrl((img as HTMLImageElement).currentSrc || img.getAttribute("src"));
          if (!src) continue;
          addMedia(src, imageUrls);
        }

        for (const source of Array.from(root.querySelectorAll<HTMLSourceElement>("source[src]"))) {
          const src = absoluteUrl(source.src || source.getAttribute("src"));
          if (src) addMedia(src, /\.(mp4|m3u8|webm)(\?|$)/i.test(src) ? videoUrls : imageUrls);
        }

        for (const video of Array.from(root.querySelectorAll<HTMLVideoElement>("video[src]"))) {
          const src = absoluteUrl(video.src || video.getAttribute("src"));
          if (src) addMedia(src, videoUrls);
        }

        for (const embed of Array.from(root.querySelectorAll("shreddit-embed[html], iframe[src]"))) {
          const direct = embed.getAttribute("src");
          if (direct) addMedia(direct, embedUrls);

          const html = embed.getAttribute("html");
          if (html) {
            const decoded = decodeHtml(html);
            const match = decoded.match(/\ssrc=["']([^"']+)["']/i);
            if (match?.[1]) addMedia(match[1], embedUrls);
          }
        }

        for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
          const href = absoluteUrl(link.getAttribute("href"));
          if (!href) continue;
          if (/\/comments\/|\/user\/|\/u\/|\/r\//i.test(href)) continue;
          if (/reddit\.com\/media|i\.redd\.it|preview\.redd\.it|v\.redd\.it|redgifs\.com|imgur\.com/i.test(href)) {
            addMedia(href, externalUrls);
          }
        }

        for (const url of externalUrls) mediaUrls.add(url);

        return {
          mediaUrls: [...mediaUrls],
          imageUrls: [...imageUrls],
          videoUrls: [...videoUrls],
          embedUrls: [...embedUrls],
          outboundUrl: [...externalUrls][0] ?? [...embedUrls][0] ?? [...videoUrls][0] ?? [...imageUrls][0] ?? null,
        };
      };

      const collectTags = (root: Element, overflow: Element | null, flair: string, postType: string | null) => {
        const tags = new Set<string>();
        if (flair) tags.add(flair);
        if (postType) tags.add(postType);
        if (root.hasAttribute("is-post-nsfw") || overflow?.hasAttribute("is-post-nsfw")) tags.add("nsfw");
        if (root.hasAttribute("is-spoiler") || overflow?.hasAttribute("is-spoiler")) tags.add("spoiler");
        if (getAttr(root, ["has-post-flair"]) || overflow?.hasAttribute("has-post-flair")) tags.add("has-flair");

        for (const tag of Array.from(root.querySelectorAll("shreddit-distinguished-post-tags, shreddit-post-flair, [slot='post-flair']"))) {
          const text = clean(tag.textContent);
          if (text) tags.add(text);
        }

        return [...tags];
      };

      const extractPost = (root: Element): ExtensionJsonPost | null => {
        const overflow = findOverflowMenu(root);
        const permalink = findPermalink(root, overflow);
        const id =
          getAttr(root, ["post-id", "thingid", "data-fullname"]).replace(/^t3_/i, "") ||
          getAttr(overflow ?? root, ["post-id", "source-id"]).replace(/^t3_/i, "") ||
          idFromPermalink(permalink);
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

        const author = findAuthor(root, overflow);
        if (!/^[A-Za-z0-9_-]{3,20}$/.test(author)) return null;

        const subreddit = findSubreddit(root, overflow, permalink);
        const flair = getText(root, [
          '[data-testid="post-flair"]',
          '[slot="post-flair"]',
          "shreddit-post-flair",
          ".flair",
        ]);
        const postType = getAttr(root, ["post-type"]) || getAttr(overflow ?? root, ["post-type"]) || null;

        const scoreText =
          getAttr(root, ["score"]) ||
          getAttr(overflow ?? root, ["score"]) ||
          getText(root, ["[score]", "[data-testid='post-vote-count']", "shreddit-score", "[aria-label*='upvote']"]);
        const commentText =
          getAttr(root, ["comment-count"]) ||
          getAttr(overflow ?? root, ["comment-count"]) ||
          getText(root, [
            'a[href*="/comments/"] span',
            '[data-testid="comment-count"]',
            '[aria-label*="comment"]',
          ]);

        const media = collectUrls(root);
        const tags = collectTags(root, overflow, flair, postType);
        const score = numberFromText(scoreText);
        const commentCount = numberFromText(commentText);
        const canonicalPermalink = permalink || absoluteUrl(`/r/${subreddit}/comments/${id}/`);

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
        };
      };

      const roots = [
        ...Array.from(document.querySelectorAll("shreddit-post")),
        ...Array.from(document.querySelectorAll('[data-testid="post-container"]')),
        ...Array.from(document.querySelectorAll("article")),
      ];

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
      const scrollHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0,
        document.documentElement.offsetHeight,
        document.body?.offsetHeight ?? 0,
      );
      const atBottom = scrollTop + viewportHeight >= scrollHeight - Math.max(600, viewportHeight * 0.5);

      return {
        posts: [...posts.values()],
        scrollTop,
        scrollHeight,
        viewportHeight,
        atBottom,
      };
    },
  });

  const result = injection?.result;
  if (!result || !Array.isArray(result.posts)) {
    throw new Error("Page JSON crawl failed: no harvest result returned");
  }

  return result;
}

async function scrollPage(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      window.scrollBy({
        top: Math.max(window.innerHeight * 3, 30000),
        behavior: "smooth",
      });
    },
  });
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

async function updateCrawlStats(stats: Partial<CrawlStats>) {
  const current = await getCrawlStats();
  await chrome.storage.local.set({
    crawlStats: {
      ...current,
      ...stats,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function getCrawlStats(): Promise<CrawlStats> {
  const stored = await chrome.storage.local.get<Record<string, unknown>>(["crawlStats"]);
  const stats = isRecord(stored.crawlStats) ? stored.crawlStats : {};

  return {
    status: typeof stats.status === "string" ? (stats.status as CrawlStats["status"]) : "idle",
    taskTarget: typeof stats.taskTarget === "string" ? stats.taskTarget : undefined,
    taskUrl: typeof stats.taskUrl === "string" ? stats.taskUrl : undefined,
    scrollPasses: typeof stats.scrollPasses === "number" ? stats.scrollPasses : 0,
    postsSeen: typeof stats.postsSeen === "number" ? stats.postsSeen : 0,
    newPosts: typeof stats.newPosts === "number" ? stats.newPosts : 0,
    batchesSent: typeof stats.batchesSent === "number" ? stats.batchesSent : 0,
    apiBuffered: typeof stats.apiBuffered === "number" ? stats.apiBuffered : 0,
    savedPosts: typeof stats.savedPosts === "number" ? stats.savedPosts : 0,
    completionsFound: typeof stats.completionsFound === "number" ? stats.completionsFound : 0,
    heightStableRounds: typeof stats.heightStableRounds === "number" ? stats.heightStableRounds : 0,
    noNewRounds: typeof stats.noNewRounds === "number" ? stats.noNewRounds : 0,
    bottomRounds: typeof stats.bottomRounds === "number" ? stats.bottomRounds : 0,
    endDetected: stats.endDetected === true,
    stopRequested: stats.stopRequested === true,
    reason: typeof stats.reason === "string" ? stats.reason : undefined,
    updatedAt: typeof stats.updatedAt === "string" ? stats.updatedAt : new Date().toISOString(),
  };
}

async function saveLastTask(task: ExtensionTask) {
  await chrome.storage.local.set({
    lastTask: `${task.type}:${task.target}`,
    lastTaskUrl: task.url,
    lastTaskAt: new Date().toISOString(),
  });
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
