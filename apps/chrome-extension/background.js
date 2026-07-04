const DEFAULT_API_BASE = "https://api.paidpolitely.com";

const STORAGE_KEYS = {
  installId: "paidPolitely.installId",
  apiBase: "paidPolitely.apiBase",
  statePrefix: "paidPolitely.streamState:",
};

const DEFAULT_STATE = {
  status: "idle",
  apiBase: DEFAULT_API_BASE,
  pageUrl: "",
  tabId: null,
  sessionId: "",
  uploadToken: "",
  scrolls: 0,
  linksSeen: 0,
  linksQueued: 0,
  postsFetched: 0,
  postsSynced: 0,
  postsSkipped: 0,
  message: "Ready.",
};

const FETCH_CONCURRENCY = 3;
const STREAM_BATCH_SIZE = 10;
const STREAM_FLUSH_MS = 1000;
const DEFAULT_WAIT_MS = 1200;
const DEFAULT_STABLE_ROUNDS = 14;
const DEFAULT_MAX_SCROLLS = 1800;

const crawlsByTabId = new Map();
const crawlsById = new Map();

chrome.runtime.onInstalled.addListener(() => {
  ensureInstallId().catch(() => undefined);
});

chrome.runtime.onMessage.addListener((payload, _sender, sendResponse) => {
  handleMessage(payload)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ...DEFAULT_STATE, status: "error", message: String(error?.message || error) });
    });

  return true;
});

async function handleMessage(payload) {
  const tabId = Number(payload?.tabId);

  if (payload?.type === "GET_CONFIG") {
    return getConfig();
  }

  if (payload?.type === "SAVE_CONFIG") {
    return setConfig({ apiBase: payload.apiBase });
  }

  if (payload?.type === "GET_STATE") {
    return Number.isInteger(tabId) ? getState(tabId) : DEFAULT_STATE;
  }

  if (payload?.type === "START_CRAWL") {
    const pageUrl = String(payload.pageUrl || "");
    const apiBase = normaliseApiBase(payload.apiBase || DEFAULT_API_BASE);

    if (!Number.isInteger(tabId) || !isRedditUrl(pageUrl)) {
      return Number.isInteger(tabId)
        ? setState(tabId, { ...DEFAULT_STATE, tabId, status: "error", message: "Open a reddit.com page first." })
        : { ...DEFAULT_STATE, status: "error", message: "Open a reddit.com page first." };
    }

    const existing = crawlsByTabId.get(tabId);
    if (existing && !existing.finalising) {
      return setState(tabId, { status: "error", message: "This tab already has a crawl running." });
    }

    await setConfig({ apiBase });

    const state = await setState(tabId, {
      ...DEFAULT_STATE,
      tabId,
      apiBase,
      pageUrl,
      status: "running",
      message: "Starting session...",
    });

    runCrawl(tabId, state).catch(async (error) => {
      const crawl = crawlsByTabId.get(tabId);
      if (crawl) {
        crawl.stopRequested = true;
        crawl.scrollComplete = true;
      }

      await setState(tabId, { status: "error", message: String(error?.message || error) });
    });

    return state;
  }

  if (payload?.type === "STOP_CRAWL") {
    if (!Number.isInteger(tabId)) return { ...DEFAULT_STATE, status: "error", message: "Missing tab id." };

    const crawl = crawlsByTabId.get(tabId);
    if (!crawl) return setState(tabId, { status: "idle", message: "No crawl is running for this tab." });

    crawl.stopRequested = true;
    await requestInjectedCrawlerStop(tabId);
    return setState(tabId, { status: "running", message: "Stopping scroll and flushing queued posts..." });
  }

  if (payload?.type === "PAGE_LINKS") {
    handlePageLinks(payload).catch(() => undefined);
    return { ok: true };
  }

  if (payload?.type === "PAGE_DONE") {
    handlePageDone(payload).catch(() => undefined);
    return { ok: true };
  }

  if (payload?.type === "PAGE_ERROR") {
    handlePageError(payload).catch(() => undefined);
    return { ok: true };
  }

  return Number.isInteger(tabId) ? getState(tabId) : DEFAULT_STATE;
}

async function runCrawl(tabId, initialState) {
  let crawl = null;

  try {
    const installId = await ensureInstallId();
    const target = inferTargetFromUrl(initialState.pageUrl);

    const sessionResponse = await postJson(`${initialState.apiBase}/api/v1/extension/sessions`, {
      crawlMode: "page",
      redditUsername: target || undefined,
      sourceUrl: initialState.pageUrl,
      extensionInstallId: installId,
      clientVersion: chrome.runtime.getManifest().version,
    });

    const state = await setState(tabId, {
      ...initialState,
      sessionId: sessionResponse.session.id,
      uploadToken: sessionResponse.uploadToken,
      message: "Scrolling Reddit and streaming posts as they are found...",
    });

    crawl = createCrawl(tabId, state);
    crawlsByTabId.set(tabId, crawl);
    crawlsById.set(crawl.id, crawl);

    await injectCrawler(tabId, {
      crawlId: crawl.id,
      waitMs: DEFAULT_WAIT_MS,
      stableRounds: DEFAULT_STABLE_ROUNDS,
      maxScrolls: DEFAULT_MAX_SCROLLS,
    });

    return await new Promise((resolve) => {
      crawl.resolveComplete = resolve;
    });
  } finally {
    if (crawl?.flushTimer) clearTimeout(crawl.flushTimer);

    if (crawl) {
      crawlsById.delete(crawl.id);
      if (crawlsByTabId.get(tabId) === crawl) crawlsByTabId.delete(tabId);
    }
  }
}

function createCrawl(tabId, state) {
  return {
    id: crypto.randomUUID(),
    tabId,
    state,
    seenLinks: new Set(),
    linkQueue: [],
    postBatch: [],
    fetchInFlight: 0,
    uploadInFlight: false,
    scrollComplete: false,
    finalising: false,
    stopRequested: false,
    latestScrolls: 0,
    latestLinksSeen: 0,
    postsFetched: 0,
    postsSynced: 0,
    skipped: 0,
    flushTimer: null,
    resolveComplete: () => undefined,
  };
}

function getCrawlById(crawlId) {
  return typeof crawlId === "string" ? crawlsById.get(crawlId) || null : null;
}

function isActiveCrawl(crawl) {
  return Boolean(crawl && crawlsById.get(crawl.id) === crawl && crawlsByTabId.get(crawl.tabId) === crawl);
}

async function handlePageLinks(payload) {
  const crawl = getCrawlById(payload.crawlId);
  if (!isActiveCrawl(crawl) || crawl.finalising) return;

  const links = Array.isArray(payload.links) ? payload.links.filter((link) => typeof link === "string") : [];
  let newCount = 0;

  for (const link of links) {
    if (crawl.seenLinks.has(link)) continue;
    crawl.seenLinks.add(link);
    crawl.linkQueue.push(link);
    newCount++;
  }

  crawl.latestScrolls = Number(payload.scrolls) || crawl.latestScrolls;
  crawl.latestLinksSeen = Math.max(crawl.latestLinksSeen, Number(payload.totalLinks) || crawl.seenLinks.size);

  crawl.state = await setState(crawl.tabId, {
    scrolls: crawl.latestScrolls,
    linksSeen: crawl.latestLinksSeen,
    linksQueued: crawl.linkQueue.length,
    postsFetched: crawl.postsFetched,
    postsSynced: crawl.postsSynced,
    postsSkipped: crawl.skipped,
    message:
      newCount > 0
        ? `Found ${crawl.seenLinks.size} post links. Fetching and streaming...`
        : `Scrolling... ${crawl.seenLinks.size} links seen, ${crawl.postsSynced} posts saved.`,
  });

  pumpLinkQueue(crawl);
  maybeFinaliseCrawl(crawl);
}

async function handlePageDone(payload) {
  const crawl = getCrawlById(payload.crawlId);
  if (!isActiveCrawl(crawl)) return;

  crawl.scrollComplete = true;
  crawl.latestScrolls = Number(payload.scrolls) || crawl.latestScrolls;
  crawl.latestLinksSeen = Math.max(crawl.latestLinksSeen, Number(payload.totalLinks) || crawl.seenLinks.size);

  crawl.state = await setState(crawl.tabId, {
    scrolls: crawl.latestScrolls,
    linksSeen: crawl.latestLinksSeen,
    linksQueued: crawl.linkQueue.length,
    postsFetched: crawl.postsFetched,
    postsSynced: crawl.postsSynced,
    postsSkipped: crawl.skipped,
    message: "Reached the lazy-load bottom. Finishing queued posts...",
  });

  pumpLinkQueue(crawl);
  maybeFlushUpload(crawl);
  maybeFinaliseCrawl(crawl);
}

async function handlePageError(payload) {
  const crawl = getCrawlById(payload.crawlId);
  if (!isActiveCrawl(crawl)) return;

  crawl.scrollComplete = true;
  crawl.stopRequested = true;
  await setState(crawl.tabId, { status: "error", message: `Page crawler stopped: ${String(payload.error || "unknown error")}` });
  maybeFinaliseCrawl(crawl);
}

function pumpLinkQueue(crawl) {
  if (!isActiveCrawl(crawl)) return;

  while (crawl.fetchInFlight < FETCH_CONCURRENCY && crawl.linkQueue.length > 0 && !crawl.stopRequested) {
    const link = crawl.linkQueue.shift();
    crawl.fetchInFlight++;

    fetchAndQueuePost(crawl, link)
      .catch(() => {
        if (isActiveCrawl(crawl)) crawl.skipped++;
      })
      .finally(() => {
        if (!isActiveCrawl(crawl)) return;
        crawl.fetchInFlight--;
        pumpLinkQueue(crawl);
        maybeFlushUpload(crawl);
        maybeFinaliseCrawl(crawl);
      });
  }
}

async function fetchAndQueuePost(crawl, link) {
  if (!isActiveCrawl(crawl) || crawl.stopRequested) return;

  const rawPost = await fetchPostFromPermalink(link);
  const normalised = normalisePost(rawPost, link);
  if (!normalised || !isActiveCrawl(crawl)) return;

  crawl.postsFetched++;
  crawl.postBatch.push(normalised);

  crawl.state = await setState(crawl.tabId, {
    postsFetched: crawl.postsFetched,
    linksQueued: crawl.linkQueue.length,
    postsSkipped: crawl.skipped,
    message: `Fetched ${crawl.postsFetched}. Streaming ${crawl.postBatch.length} queued posts...`,
  });

  if (crawl.postBatch.length >= STREAM_BATCH_SIZE) maybeFlushUpload(crawl);
  else scheduleUploadFlush(crawl);
}

function scheduleUploadFlush(crawl) {
  if (!isActiveCrawl(crawl) || crawl.flushTimer || crawl.postBatch.length === 0) return;

  crawl.flushTimer = setTimeout(() => {
    if (!isActiveCrawl(crawl)) return;
    crawl.flushTimer = null;
    maybeFlushUpload(crawl);
  }, STREAM_FLUSH_MS);
}

function maybeFlushUpload(crawl) {
  if (!isActiveCrawl(crawl) || crawl.uploadInFlight || crawl.postBatch.length === 0) return;

  const posts = crawl.postBatch.splice(0, STREAM_BATCH_SIZE);
  crawl.uploadInFlight = true;

  uploadPosts(crawl, posts, false)
    .then(async (upload) => {
      if (!isActiveCrawl(crawl)) return;
      crawl.postsSynced = Number(upload.session?.postsReceived) || crawl.postsSynced;
      crawl.state = await setState(crawl.tabId, {
        postsSynced: crawl.postsSynced,
        linksQueued: crawl.linkQueue.length,
        postsSkipped: crawl.skipped,
        message: `Saved ${crawl.postsSynced} posts. Still scrolling/fetching in parallel...`,
      });
    })
    .catch(async (error) => {
      if (!isActiveCrawl(crawl)) return;
      crawl.stopRequested = true;
      crawl.scrollComplete = true;
      await setState(crawl.tabId, { status: "error", message: String(error?.message || error) });
    })
    .finally(() => {
      if (!isActiveCrawl(crawl)) return;
      crawl.uploadInFlight = false;
      if (crawl.postBatch.length > 0) maybeFlushUpload(crawl);
      maybeFinaliseCrawl(crawl);
    });
}

function maybeFinaliseCrawl(crawl) {
  if (!isActiveCrawl(crawl) || crawl.finalising) return;
  if (!crawl.scrollComplete && !crawl.stopRequested) return;
  if (crawl.linkQueue.length > 0 || crawl.fetchInFlight > 0 || crawl.uploadInFlight) return;

  crawl.finalising = true;

  if (crawl.flushTimer) {
    clearTimeout(crawl.flushTimer);
    crawl.flushTimer = null;
  }

  const finalPosts = crawl.postBatch.splice(0);

  uploadPosts(crawl, finalPosts, true)
    .then(async (upload) => {
      if (!isActiveCrawl(crawl)) return;
      crawl.postsSynced = Number(upload.session?.postsReceived) || crawl.postsSynced;

      const status = crawl.stopRequested ? "idle" : "completed";
      const message = crawl.stopRequested
        ? `Stopped. Saved ${crawl.postsSynced} posts, skipped ${crawl.skipped}.`
        : `Completed. Saved ${crawl.postsSynced} posts from ${crawl.seenLinks.size} links${crawl.skipped ? `, skipped ${crawl.skipped}` : ""}.`;

      await setState(crawl.tabId, {
        status,
        scrolls: crawl.latestScrolls,
        linksSeen: crawl.latestLinksSeen,
        linksQueued: 0,
        postsFetched: crawl.postsFetched,
        postsSynced: crawl.postsSynced,
        postsSkipped: crawl.skipped,
        message,
      });

      crawl.resolveComplete({ postsReceived: crawl.postsSynced, stopped: crawl.stopRequested });
    })
    .catch(async (error) => {
      if (isActiveCrawl(crawl)) {
        await setState(crawl.tabId, { status: "error", message: String(error?.message || error) });
      }
      crawl.resolveComplete({ postsReceived: crawl.postsSynced, error });
    });
}

async function injectCrawler(tabId, options) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: startInjectedRedditCrawler,
    args: [options],
  });
}

async function requestInjectedCrawlerStop(tabId) {
  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => {
        if (window.__paidPolitelyStreamCrawler) window.__paidPolitelyStreamCrawler.stopped = true;
      },
    })
    .catch(() => undefined);
}

function startInjectedRedditCrawler(options) {
  const crawlId = options?.crawlId;
  const waitMs = options?.waitMs || 1200;
  const stableRoundsTarget = options?.stableRounds || 14;
  const maxScrolls = options?.maxScrolls || 1800;

  if (!crawlId) {
    chrome.runtime.sendMessage({ type: "PAGE_ERROR", error: "Missing crawl id" }).catch(() => undefined);
    return;
  }

  if (window.__paidPolitelyStreamCrawler) window.__paidPolitelyStreamCrawler.stopped = true;

  const crawler = {
    crawlId,
    stopped: false,
    seenPostIds: new Set(),
    seenLinks: new Set(),
    scrolls: 0,
    stableRounds: 0,
    previousHeight: 0,
  };

  window.__paidPolitelyStreamCrawler = crawler;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function send(message) {
    chrome.runtime.sendMessage({ crawlId, ...message }).catch(() => undefined);
  }

  function collectNewLinks() {
    const links = [];
    const candidates = [];

    for (const post of document.querySelectorAll("shreddit-post")) {
      candidates.push(post.getAttribute("permalink"));
      candidates.push(post.getAttribute("content-href"));
      candidates.push(post.getAttribute("href"));
    }

    for (const tracker of document.querySelectorAll('faceplate-tracker[source="post"] a[href*="/comments/"]')) {
      candidates.push(tracker.href || tracker.getAttribute("href"));
    }

    for (const anchor of document.querySelectorAll('a[href*="/comments/"]')) {
      candidates.push(anchor.href || anchor.getAttribute("href"));
    }

    for (const candidate of candidates) {
      const normalised = normalisePostHref(candidate);
      if (!normalised || crawler.seenLinks.has(normalised.href) || crawler.seenPostIds.has(normalised.id)) continue;

      crawler.seenLinks.add(normalised.href);
      crawler.seenPostIds.add(normalised.id);
      links.push(normalised.href);
    }

    if (links.length > 0) {
      send({
        type: "PAGE_LINKS",
        links,
        scrolls: crawler.scrolls,
        totalLinks: crawler.seenLinks.size,
      });
    }

    return links.length;
  }

  function normalisePostHref(value) {
    if (typeof value !== "string" || !value.trim()) return null;

    try {
      const url = new URL(value, location.href);
      if (!/(^|\.)reddit\.com$/i.test(url.hostname)) return null;

      const match = url.pathname.match(/(?:\/r\/([^/]+))?\/comments\/([a-z0-9]+)(?:\/([^/?#]+))?/i);
      if (!match) return null;

      const subreddit = match[1] ? `/r/${match[1]}` : "";
      const postId = match[2].toLowerCase();
      const slug = match[3] ? `/${match[3]}` : "";

      return {
        id: postId,
        href: `https://www.reddit.com${subreddit}/comments/${postId}${slug}/`,
      };
    } catch {
      return null;
    }
  }

  async function run() {
    try {
      collectNewLinks();

      while (!crawler.stopped && crawler.scrolls < maxScrolls && crawler.stableRounds < stableRoundsTarget) {
        const beforeLinks = crawler.seenLinks.size;
        const beforeHeight = document.documentElement.scrollHeight;

        window.scrollTo({ top: beforeHeight, behavior: "auto" });
        await sleep(waitMs);
        collectNewLinks();

        window.scrollBy({ top: Math.max(500, Math.round(window.innerHeight * 0.95)), behavior: "auto" });
        await sleep(waitMs);

        const newLinks = collectNewLinks();
        crawler.scrolls++;

        const afterHeight = document.documentElement.scrollHeight;
        const atBottom = Math.ceil(window.scrollY + window.innerHeight) >= afterHeight - 8;
        const noNewHeight = afterHeight === beforeHeight && afterHeight === crawler.previousHeight;
        const noNewLinks = crawler.seenLinks.size === beforeLinks && newLinks === 0;

        crawler.stableRounds = atBottom && noNewHeight && noNewLinks ? crawler.stableRounds + 1 : 0;
        crawler.previousHeight = afterHeight;

        send({ type: "PAGE_LINKS", links: [], scrolls: crawler.scrolls, totalLinks: crawler.seenLinks.size });
      }

      collectNewLinks();
      send({ type: "PAGE_DONE", scrolls: crawler.scrolls, totalLinks: crawler.seenLinks.size, stopped: crawler.stopped });
    } catch (error) {
      send({ type: "PAGE_ERROR", error: String(error?.message || error) });
    }
  }

  run();
}

async function fetchPostFromPermalink(permalink) {
  const url = `${permalink.replace(/\/$/, "")}.json?raw_json=1`;
  let lastError = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        credentials: "include",
        headers: { accept: "application/json" },
      });

      if (response.status === 429 || response.status >= 500) {
        await sleep(750 * (attempt + 1));
        continue;
      }

      if (!response.ok) throw new Error(`Reddit returned ${response.status} for ${permalink}`);

      const listing = await response.json();
      const raw = listing?.[0]?.data?.children?.[0]?.data;
      if (!raw?.id) throw new Error(`Could not parse Reddit post JSON for ${permalink}`);

      return raw;
    } catch (error) {
      lastError = error;
      await sleep(500 * (attempt + 1));
    }
  }

  throw lastError || new Error(`Failed to fetch ${permalink}`);
}

function normalisePost(raw, fallbackPermalink) {
  if (!raw?.id || !raw?.name || !raw?.title || !raw?.author || !raw?.created_utc) return null;
  if (raw.author === "[deleted]") return null;

  const permalink = normalisePermalink(raw.permalink || fallbackPermalink || `/comments/${raw.id}`);
  const urls = extractUrls(raw, permalink);

  return {
    id: raw.id,
    name: raw.name,
    subreddit: raw.subreddit || inferSubreddit(permalink) || "unknown",
    title: raw.title,
    selftext: raw.selftext || "",
    author: raw.author,
    link_flair_text: raw.link_flair_text || null,
    score: typeof raw.score === "number" ? raw.score : 0,
    upvoteCount: typeof raw.ups === "number" ? raw.ups : null,
    upvote_ratio: typeof raw.upvote_ratio === "number" ? raw.upvote_ratio : null,
    num_comments: typeof raw.num_comments === "number" ? raw.num_comments : 0,
    shareCount: typeof raw.share_count === "number" ? raw.share_count : null,
    crosspostCount: typeof raw.num_crossposts === "number" ? raw.num_crossposts : 0,
    mediaUrls: urls.mediaUrls,
    imageUrls: urls.imageUrls,
    outboundUrl: urls.outboundUrl,
    thumbnailUrl: urls.thumbnailUrl,
    permalink,
    created_utc: raw.created_utc,
    rawJson: raw,
  };
}

function extractUrls(raw, permalink) {
  const mediaUrls = new Set();
  const imageUrls = new Set();
  const thumbnailUrl = normaliseMediaUrl(raw.thumbnail);
  const outboundUrl = extractOutboundUrl(raw, permalink);

  const addMediaUrl = (value, options = {}) => {
    const url = normaliseMediaUrl(value);
    if (!url) return;
    if (stripUrlQuery(url) === stripUrlQuery(permalink)) return;

    mediaUrls.add(url);
    if (options.image || isImageUrl(url)) imageUrls.add(url);
  };

  addMediaUrl(outboundUrl, { image: isImageUrl(outboundUrl) });
  addPreview(raw.preview, addMediaUrl);
  addMediaBlock(raw.media, addMediaUrl);
  addMediaBlock(raw.secure_media, addMediaUrl);
  addGallery(raw, addMediaUrl);

  for (const crosspost of raw.crosspost_parent_list || []) {
    const crosspostPermalink = normalisePermalink(crosspost.permalink || `/comments/${crosspost.id || ""}`);
    const crosspostUrls = extractUrls(crosspost, crosspostPermalink);
    for (const url of crosspostUrls.mediaUrls) mediaUrls.add(url);
    for (const url of crosspostUrls.imageUrls) imageUrls.add(url);
  }

  return { mediaUrls: [...mediaUrls], imageUrls: [...imageUrls], outboundUrl, thumbnailUrl };
}

function extractOutboundUrl(raw, permalink) {
  const directUrl = normaliseMediaUrl(raw.url_overridden_by_dest || raw.url);
  if (!directUrl) return null;
  return stripUrlQuery(directUrl) === stripUrlQuery(permalink) ? null : directUrl;
}

function addPreview(preview, addMediaUrl) {
  for (const image of preview?.images || []) {
    addMediaUrl(image.source?.url, { image: true });
    for (const resolution of image.resolutions || []) addMediaUrl(resolution.url, { image: true });
    for (const variant of Object.values(image.variants || {})) {
      addMediaUrl(variant.source?.url, { image: true });
      for (const resolution of variant.resolutions || []) addMediaUrl(resolution.url, { image: true });
    }
  }

  addVideo(preview?.reddit_video_preview, addMediaUrl);
}

function addMediaBlock(media, addMediaUrl) {
  addVideo(media?.reddit_video, addMediaUrl);
  addMediaUrl(media?.oembed?.thumbnail_url);
  addMediaUrl(media?.oembed?.url);
}

function addVideo(video, addMediaUrl) {
  addMediaUrl(video?.fallback_url);
  addMediaUrl(video?.scrubber_media_url);
  addMediaUrl(video?.hls_url);
  addMediaUrl(video?.dash_url);
}

function addGallery(raw, addMediaUrl) {
  const mediaMetadata = raw.media_metadata || {};
  const galleryItems = raw.gallery_data?.items || [];
  const entries = galleryItems.length > 0
    ? galleryItems.map((item) => [item.media_id, mediaMetadata[item.media_id]]).filter(([, metadata]) => metadata)
    : Object.entries(mediaMetadata);

  for (const [, metadata] of entries) {
    addMediaMetadataImage(metadata?.s, addMediaUrl);
    for (const preview of metadata?.p || []) addMediaMetadataImage(preview, addMediaUrl);
    for (const original of metadata?.o || []) addMediaMetadataImage(original, addMediaUrl);
  }
}

function addMediaMetadataImage(image, addMediaUrl) {
  addMediaUrl(image?.u || image?.url, { image: true });
  addMediaUrl(image?.gif, { image: true });
  addMediaUrl(image?.mp4);
}

async function uploadPosts(crawl, posts, completed) {
  return postJsonWithRetry(`${crawl.state.apiBase}/api/v1/extension/posts/stream`, {
    sessionId: crawl.state.sessionId,
    uploadToken: crawl.state.uploadToken,
    posts,
    scrolls: crawl.latestScrolls,
    linksSeen: crawl.latestLinksSeen,
    completed,
  });
}

async function postJsonWithRetry(url, body) {
  let lastError = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await postJson(url, body);
    } catch (error) {
      lastError = error;
      await sleep(600 * (attempt + 1));
    }
  }

  throw lastError || new Error(`Failed to POST ${url}`);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `Request failed with ${response.status}`);
  return json;
}

async function ensureInstallId() {
  const existing = await chrome.storage.local.get(STORAGE_KEYS.installId);
  if (existing[STORAGE_KEYS.installId]) return existing[STORAGE_KEYS.installId];

  const installId = crypto.randomUUID();
  await chrome.storage.local.set({ [STORAGE_KEYS.installId]: installId });
  return installId;
}

async function getConfig() {
  const data = await chrome.storage.local.get({ [STORAGE_KEYS.apiBase]: DEFAULT_API_BASE });
  return { apiBase: normaliseApiBase(data[STORAGE_KEYS.apiBase]) };
}

async function setConfig(config) {
  const apiBase = normaliseApiBase(config.apiBase || DEFAULT_API_BASE);
  await chrome.storage.local.set({ [STORAGE_KEYS.apiBase]: apiBase });
  return { apiBase };
}

function stateKey(tabId) {
  return `${STORAGE_KEYS.statePrefix}${tabId}`;
}

async function getState(tabId) {
  if (!Number.isInteger(tabId)) return DEFAULT_STATE;
  const fallback = { ...DEFAULT_STATE, tabId };
  const data = await chrome.storage.local.get({ [stateKey(tabId)]: fallback });
  return data[stateKey(tabId)] || fallback;
}

async function setState(tabId, patch) {
  if (!Number.isInteger(tabId)) return { ...DEFAULT_STATE, ...patch };

  const current = await getState(tabId);
  const next = { ...current, ...patch, tabId };
  await chrome.storage.local.set({ [stateKey(tabId)]: next });
  chrome.runtime.sendMessage({ type: "CRAWL_STATE", tabId, state: next }).catch(() => undefined);
  return next;
}

function normaliseApiBase(value) {
  return String(value || DEFAULT_API_BASE).trim().replace(/\/+$/, "") || DEFAULT_API_BASE;
}

function isRedditUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)reddit\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function inferTargetFromUrl(value) {
  try {
    const url = new URL(value);
    const user = url.pathname.match(/\/user\/([^/?#]+)/i)?.[1];
    const subreddit = url.pathname.match(/\/r\/([^/?#]+)/i)?.[1];
    if (user) return user.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
    if (subreddit) return `r_${subreddit.replace(/[^A-Za-z0-9_]/g, "").slice(0, 48)}`;
    if (url.pathname.match(/^\/new\/?$/i)) return "reddit_new";
    return "reddit_home";
  } catch {
    return "pagecrawl";
  }
}

function inferSubreddit(permalink) {
  return permalink.match(/\/r\/([^/]+)\//i)?.[1] || null;
}

function normalisePermalink(value) {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://www.reddit.com${value.startsWith("/") ? value : `/${value}`}`;
}

function normaliseMediaUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  const decoded = decodeHtmlEntities(value.trim());
  const ignored = new Set(["default", "self", "nsfw", "spoiler", "image", ""]);
  if (ignored.has(decoded.toLowerCase())) return null;
  if (!/^https?:\/\//i.test(decoded)) return null;

  return decoded;
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'");
}

function isImageUrl(value) {
  if (!value) return false;
  return (
    /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(value) ||
    /\/\/(?:i|preview)\.redd\.it\//i.test(value) ||
    /\/\/media\.redgifs\.com\/.+-poster\.(?:jpe?g|png|webp)/i.test(value)
  );
}

function stripUrlQuery(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return String(value).replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
