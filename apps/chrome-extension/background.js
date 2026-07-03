const STORAGE_KEYS = {
  installId: "installId",
  state: "syncState",
};

const DEFAULT_STATE = {
  status: "idle",
  mode: "page",
  username: "",
  sessionId: "",
  uploadToken: "",
  apiBase: "https://api.paidpolitely.com",
  pageUrl: "",
  pagesScanned: 0,
  postsSynced: 0,
  message: "Ready.",
};

const FETCH_CONCURRENCY = 4;
const UPLOAD_BATCH_SIZE = 25;
const UPLOAD_FLUSH_MS = 2500;

let running = false;
let activeCrawlTabId = null;
let pipeline = null;

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInstallId();
});

chrome.runtime.onMessage.addListener((payload, _sender, sendResponse) => {
  handleMessage(payload).then(sendResponse);
  return true;
});

async function handleMessage(payload) {
  if (payload?.type === "GET_STATE") {
    return getState();
  }

  if (payload?.type === "START_PAGE_CRAWL") {
    const tabId = Number(payload.tabId);
    const pageUrl = String(payload.pageUrl || "");
    const apiBase = String(payload.apiBase || DEFAULT_STATE.apiBase).replace(/\/+$/, "");

    if (!Number.isInteger(tabId) || !isRedditUrl(pageUrl)) {
      return setState({ ...DEFAULT_STATE, status: "error", message: "Open a Reddit page before crawling." });
    }

    if (running) {
      return setState({ status: "error", message: "A crawl is already running. Stop it before starting another." });
    }

    activeCrawlTabId = tabId;

    const state = await setState({
      ...DEFAULT_STATE,
      status: "running",
      mode: "page",
      apiBase,
      pageUrl,
      username: inferUsernameFromUrl(pageUrl) || "",
      message: "Starting concurrent scroll, parse, and upload...",
    });

    runPageCrawl(tabId, state).catch(async (error) => {
      running = false;
      activeCrawlTabId = null;
      pipeline = null;
      await setState({ status: "error", message: String(error?.message || error) });
    });

    return state;
  }

  if (payload?.type === "STOP_SYNC") {
    if (pipeline) pipeline.stopRequested = true;
    await requestPageCrawlerStop();
    return setState({ status: "running", message: "Stopping scroll and finishing queued uploads..." });
  }

  if (payload?.type === "PAGE_CRAWL_LINKS") {
    handlePageLinks(payload).catch(() => {});
    return { ok: true };
  }

  if (payload?.type === "PAGE_CRAWL_DONE") {
    handlePageDone(payload).catch(() => {});
    return { ok: true };
  }

  if (payload?.type === "PAGE_CRAWL_ERROR") {
    handlePageError(payload).catch(() => {});
    return { ok: true };
  }

  return getState();
}

async function runPageCrawl(tabId, initialState) {
  running = true;

  try {
    const installId = await ensureInstallId();

    const sessionResponse = await postJson(`${initialState.apiBase}/api/v1/extension/sessions`, {
      crawlMode: "page",
      redditUsername: initialState.username || undefined,
      sourceUrl: initialState.pageUrl,
      extensionInstallId: installId,
      clientVersion: chrome.runtime.getManifest().version,
    });

    const state = await setState({
      sessionId: sessionResponse.session.id,
      uploadToken: sessionResponse.uploadToken,
      message: "Scrolling, parsing, and uploading concurrently...",
    });

    pipeline = createPipeline(tabId, state);
    await startStreamingPageCrawler(tabId, { crawlId: pipeline.id, waitMs: 900, stableRounds: 10, maxScrolls: 500 });

    await new Promise((resolve) => {
      pipeline.resolveComplete = resolve;
    });
  } finally {
    if (pipeline?.flushTimer) clearTimeout(pipeline.flushTimer);
    running = false;
    activeCrawlTabId = null;
    pipeline = null;
  }
}

function createPipeline(tabId, state) {
  return {
    id: crypto.randomUUID(),
    tabId,
    state,
    seenLinks: new Set(),
    linkQueue: [],
    postBatch: [],
    fetchInFlight: 0,
    uploadInFlight: false,
    uploadPending: false,
    scrollComplete: false,
    finalising: false,
    stopRequested: false,
    skipped: 0,
    latestScrolls: 0,
    flushTimer: null,
    resolveComplete: () => {},
  };
}

async function handlePageLinks(payload) {
  if (!pipeline || payload.crawlId !== pipeline.id || pipeline.finalising) return;

  const links = Array.isArray(payload.links) ? payload.links.filter((link) => typeof link === "string") : [];
  const newLinks = [];

  for (const link of links) {
    if (pipeline.seenLinks.has(link)) continue;
    pipeline.seenLinks.add(link);
    pipeline.linkQueue.push(link);
    newLinks.push(link);
  }

  pipeline.latestScrolls = Number(payload.scrolls) || pipeline.latestScrolls;

  if (newLinks.length > 0) {
    pipeline.state = await setState({
      pagesScanned: pipeline.latestScrolls,
      message: `Scrolling... found ${pipeline.seenLinks.size} links, queued ${pipeline.linkQueue.length}.`,
    });
  } else {
    pipeline.state = await setState({
      pagesScanned: pipeline.latestScrolls,
      message: `Scrolling... parsed ${pipeline.seenLinks.size} links, uploading in parallel.`,
    });
  }

  pumpLinkQueue();
  maybeFinalizePipeline();
}

async function handlePageDone(payload) {
  if (!pipeline || payload.crawlId !== pipeline.id) return;

  pipeline.scrollComplete = true;
  pipeline.latestScrolls = Number(payload.scrolls) || pipeline.latestScrolls;
  pipeline.state = await setState({
    pagesScanned: pipeline.latestScrolls,
    message: "Reached the end of lazy loading. Finishing queued uploads...",
  });

  pumpLinkQueue();
  maybeFlushUpload();
  maybeFinalizePipeline();
}

async function handlePageError(payload) {
  if (!pipeline || payload.crawlId !== pipeline.id) return;

  pipeline.scrollComplete = true;
  pipeline.stopRequested = true;
  pipeline.state = await setState({
    message: `Page crawler stopped: ${String(payload.error || "unknown error")}`,
  });

  maybeFinalizePipeline();
}

function pumpLinkQueue() {
  if (!pipeline) return;

  while (
    pipeline.fetchInFlight < FETCH_CONCURRENCY &&
    pipeline.linkQueue.length > 0 &&
    !pipeline.stopRequested
  ) {
    const link = pipeline.linkQueue.shift();
    pipeline.fetchInFlight++;

    fetchAndQueuePost(link)
      .catch(() => {
        if (pipeline) pipeline.skipped++;
      })
      .finally(() => {
        if (!pipeline) return;
        pipeline.fetchInFlight--;
        pumpLinkQueue();
        maybeFlushUpload();
        maybeFinalizePipeline();
      });
  }
}

async function fetchAndQueuePost(link) {
  if (!pipeline) return;

  const rawPost = await fetchPostFromPermalink(link);
  const normalised = normalisePost(rawPost);
  if (!normalised || !pipeline) return;

  pipeline.postBatch.push(normalised);

  if (pipeline.postBatch.length >= UPLOAD_BATCH_SIZE) {
    maybeFlushUpload();
  } else {
    scheduleUploadFlush();
  }
}

function scheduleUploadFlush() {
  if (!pipeline || pipeline.flushTimer || pipeline.postBatch.length === 0) return;

  pipeline.flushTimer = setTimeout(() => {
    if (!pipeline) return;
    pipeline.flushTimer = null;
    maybeFlushUpload();
  }, UPLOAD_FLUSH_MS);
}

function maybeFlushUpload() {
  if (!pipeline || pipeline.uploadInFlight || pipeline.postBatch.length === 0) return;

  const posts = pipeline.postBatch.splice(0, UPLOAD_BATCH_SIZE);
  pipeline.uploadInFlight = true;

  uploadBatch(pipeline.state, posts, false)
    .then(async (upload) => {
      if (!pipeline) return;
      pipeline.state = await setState({
        postsSynced: upload.session.postsReceived,
        message: `Scrolling, parsing, uploading... synced ${upload.session.postsReceived} posts.`,
      });
    })
    .catch(async (error) => {
      if (!pipeline) return;
      pipeline.stopRequested = true;
      pipeline.scrollComplete = true;
      await setState({ status: "error", message: String(error?.message || error) });
    })
    .finally(() => {
      if (!pipeline) return;
      pipeline.uploadInFlight = false;
      if (pipeline.postBatch.length > 0) maybeFlushUpload();
      maybeFinalizePipeline();
    });
}

function maybeFinalizePipeline() {
  if (!pipeline || pipeline.finalising) return;
  if (!pipeline.scrollComplete && !pipeline.stopRequested) return;
  if (pipeline.linkQueue.length > 0 || pipeline.fetchInFlight > 0 || pipeline.uploadInFlight) return;

  pipeline.finalising = true;
  if (pipeline.flushTimer) {
    clearTimeout(pipeline.flushTimer);
    pipeline.flushTimer = null;
  }

  const posts = pipeline.postBatch.splice(0);

  uploadBatch(pipeline.state, posts, true)
    .then(async (upload) => {
      if (!pipeline) return;
      await setState({
        status: pipeline.stopRequested ? "idle" : "completed",
        pagesScanned: pipeline.latestScrolls,
        postsSynced: upload.session.postsReceived,
        message: pipeline.stopRequested
          ? `Stopped. Synced ${upload.session.postsReceived} posts.`
          : `Completed. Synced ${upload.session.postsReceived} posts from ${pipeline.seenLinks.size} links${pipeline.skipped ? `, skipped ${pipeline.skipped}` : ""}.`,
      });
    })
    .catch(async (error) => {
      await setState({ status: "error", message: String(error?.message || error) });
    })
    .finally(() => {
      pipeline?.resolveComplete();
    });
}

async function startStreamingPageCrawler(tabId, options) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: startConcurrentRedditCrawler,
    args: [options],
  });
}

async function requestPageCrawlerStop() {
  if (!activeCrawlTabId) return;

  await chrome.scripting
    .executeScript({
      target: { tabId: activeCrawlTabId },
      func: () => {
        if (window.__paidPolitelyCrawler) window.__paidPolitelyCrawler.stopped = true;
      },
    })
    .catch(() => {});
}

function startConcurrentRedditCrawler(options) {
  const crawlId = options?.crawlId;
  const waitMs = options?.waitMs || 900;
  const stableRoundsTarget = options?.stableRounds || 10;
  const maxScrolls = options?.maxScrolls || 500;

  if (!crawlId) {
    chrome.runtime.sendMessage({ type: "PAGE_CRAWL_ERROR", error: "Missing crawl id" }).catch(() => {});
    return;
  }

  if (window.__paidPolitelyCrawler) {
    window.__paidPolitelyCrawler.stopped = true;
  }

  const crawler = {
    crawlId,
    stopped: false,
    seen: new Set(),
    scrolls: 0,
    stableRounds: 0,
    previousHeight: 0,
  };

  window.__paidPolitelyCrawler = crawler;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function send(message) {
    chrome.runtime.sendMessage({ crawlId, ...message }).catch(() => {});
  }

  function collectNewLinks() {
    const links = [];

    for (const anchor of document.querySelectorAll('a[href*="/comments/"]')) {
      const href = anchor.href || anchor.getAttribute("href") || "";
      const permalink = normalisePostHref(href);
      if (!permalink || crawler.seen.has(permalink)) continue;
      crawler.seen.add(permalink);
      links.push(permalink);
    }

    if (links.length > 0) {
      send({
        type: "PAGE_CRAWL_LINKS",
        links,
        scrolls: crawler.scrolls,
        totalLinks: crawler.seen.size,
      });
    }

    return links.length;
  }

  function normalisePostHref(href) {
    try {
      const url = new URL(href, location.href);
      const host = url.hostname.toLowerCase();
      if (!/(^|\.)reddit\.com$/.test(host)) return null;

      const match = url.pathname.match(/\/comments\/([a-z0-9]+)(?:\/[^/]+)?\/?/i);
      if (!match) return null;

      const parts = url.pathname.split("/").filter(Boolean);
      const commentsIndex = parts.findIndex((part) => part.toLowerCase() === "comments");
      const subredditIndex = parts.findIndex((part) => part.toLowerCase() === "r");
      const subreddit = subredditIndex >= 0 ? `/${parts[subredditIndex]}/${parts[subredditIndex + 1]}` : "";
      const slug = parts[commentsIndex + 2] ? `/${parts[commentsIndex + 2]}` : "";
      return `https://www.reddit.com${subreddit}/comments/${match[1]}${slug}/`;
    } catch {
      return null;
    }
  }

  async function run() {
    try {
      collectNewLinks();

      while (!crawler.stopped && crawler.scrolls < maxScrolls && crawler.stableRounds < stableRoundsTarget) {
        const beforeLinks = crawler.seen.size;
        const beforeHeight = document.documentElement.scrollHeight;

        window.scrollTo({ top: beforeHeight, behavior: "auto" });
        await sleep(waitMs);
        collectNewLinks();

        window.scrollBy({ top: Math.max(400, Math.round(window.innerHeight * 0.9)), behavior: "auto" });
        await sleep(waitMs);

        const newLinkCount = collectNewLinks();
        crawler.scrolls++;

        const afterHeight = document.documentElement.scrollHeight;
        const atBottom = Math.ceil(window.scrollY + window.innerHeight) >= afterHeight - 4;
        const noNewHeight = afterHeight === beforeHeight && afterHeight === crawler.previousHeight;
        const noNewLinks = crawler.seen.size === beforeLinks && newLinkCount === 0;

        crawler.stableRounds = atBottom && noNewHeight && noNewLinks ? crawler.stableRounds + 1 : 0;
        crawler.previousHeight = afterHeight;

        send({
          type: "PAGE_CRAWL_LINKS",
          links: [],
          scrolls: crawler.scrolls,
          totalLinks: crawler.seen.size,
        });
      }

      collectNewLinks();
      send({
        type: "PAGE_CRAWL_DONE",
        scrolls: crawler.scrolls,
        totalLinks: crawler.seen.size,
        stopped: crawler.stopped,
      });
    } catch (error) {
      send({ type: "PAGE_CRAWL_ERROR", error: String(error?.message || error) });
    }
  }

  run();
}

async function fetchPostFromPermalink(permalink) {
  const url = `${permalink.replace(/\/$/, "")}.json?raw_json=1`;
  const response = await fetch(url, {
    credentials: "include",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Reddit returned ${response.status} for ${permalink}`);
  }

  const listing = await response.json();
  const raw = listing?.[0]?.data?.children?.[0]?.data;
  if (!raw?.id) {
    throw new Error(`Could not parse Reddit post JSON for ${permalink}`);
  }

  return raw;
}

async function uploadBatch(state, posts, completed) {
  return postJson(`${state.apiBase}/api/v1/extension/posts/batch`, {
    sessionId: state.sessionId,
    uploadToken: state.uploadToken,
    posts,
    nextCursor: null,
    completed,
  });
}

function normalisePost(raw) {
  if (!raw?.id || !raw?.name || !raw?.title || !raw?.author || !raw?.created_utc) return null;
  if (raw.author === "[deleted]") return null;

  const permalink = normalisePermalink(raw.permalink || `/comments/${raw.id}`);
  const urls = extractUrls(raw, permalink);

  return {
    id: raw.id,
    name: raw.name,
    subreddit: raw.subreddit || inferSubreddit(permalink) || "",
    title: raw.title,
    selftext: raw.selftext || "",
    author: raw.author,
    link_flair_text: raw.link_flair_text || null,
    score: raw.score || 0,
    upvoteCount: typeof raw.ups === "number" ? raw.ups : null,
    upvote_ratio: typeof raw.upvote_ratio === "number" ? raw.upvote_ratio : null,
    num_comments: raw.num_comments || 0,
    shareCount: typeof raw.share_count === "number" ? raw.share_count : null,
    crosspostCount: raw.num_crossposts || 0,
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

    if (options.image || isImageUrl(url)) {
      imageUrls.add(url);
    }
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

  return {
    mediaUrls: [...mediaUrls],
    imageUrls: [...imageUrls],
    outboundUrl,
    thumbnailUrl,
  };
}

function extractOutboundUrl(raw, permalink) {
  const directUrl = normaliseMediaUrl(raw.url_overridden_by_dest || raw.url);
  if (!directUrl) return null;

  return stripUrlQuery(directUrl) === stripUrlQuery(permalink) ? null : directUrl;
}

function addPreview(preview, addMediaUrl) {
  for (const image of preview?.images || []) {
    addMediaUrl(image.source?.url, { image: true });

    for (const resolution of image.resolutions || []) {
      addMediaUrl(resolution.url, { image: true });
    }

    for (const variant of Object.values(image.variants || {})) {
      addMediaUrl(variant.source?.url, { image: true });

      for (const resolution of variant.resolutions || []) {
        addMediaUrl(resolution.url, { image: true });
      }
    }
  }

  addVideo(preview?.reddit_video_preview, addMediaUrl);
}

function addMediaBlock(media, addMediaUrl) {
  addVideo(media?.reddit_video, addMediaUrl);
  addMediaUrl(media?.oembed?.thumbnail_url, { image: true });
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

  const entries =
    galleryItems.length > 0
      ? galleryItems
          .map((item) => [item.media_id, mediaMetadata[item.media_id]])
          .filter(([, metadata]) => metadata)
      : Object.entries(mediaMetadata);

  for (const [, metadata] of entries) {
    addMediaMetadataImage(metadata?.s, addMediaUrl);

    for (const preview of metadata?.p || []) {
      addMediaMetadataImage(preview, addMediaUrl);
    }

    for (const original of metadata?.o || []) {
      addMediaMetadataImage(original, addMediaUrl);
    }
  }
}

function addMediaMetadataImage(image, addMediaUrl) {
  addMediaUrl(image?.u || image?.url, { image: true });
  addMediaUrl(image?.gif, { image: true });
  addMediaUrl(image?.mp4);
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
  if (existing.installId) return existing.installId;

  const installId = crypto.randomUUID();
  await chrome.storage.local.set({ [STORAGE_KEYS.installId]: installId });
  return installId;
}

async function getState(tabId) {
  if (!Number.isInteger(tabId)) return DEFAULT_STATE;

  const data = await chrome.storage.local.get({
    [stateKey(tabId)]: { ...DEFAULT_STATE, tabId },
  });

  return data[stateKey(tabId)] || { ...DEFAULT_STATE, tabId };
}

async function setState(tabId, patch) {
  const current = await getState(tabId);
  const next = { ...current, ...patch, tabId };

  await chrome.storage.local.set({ [stateKey(tabId)]: next });
  chrome.runtime.sendMessage({ type: "SYNC_STATE", tabId, state: next }).catch(() => {});

  return next;
}

function isRedditUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)reddit\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function inferUsernameFromUrl(value) {
  try {
    return new URL(value).pathname.match(/\/user\/([^/?#]+)/i)?.[1] || "";
  } catch {
    return "";
  }
}
