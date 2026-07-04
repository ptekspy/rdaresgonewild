const STORAGE_KEYS = {
  installId: "paidPolitelyLocalCrawler.installId",
  config: "paidPolitelyLocalCrawler.config",
  statePrefix: "paidPolitelyLocalCrawler.state:",
};

const DEFAULT_WRITER_BASE = "http://127.0.0.1:8791";

const DEFAULT_STATE = {
  status: "idle",
  writerBase: DEFAULT_WRITER_BASE,
  pageUrl: "",
  tabId: null,
  sessionId: "",
  uploadToken: "",
  scrolls: 0,
  postsParsed: 0,
  postsSaved: 0,
  message: "Ready.",
};

const UPLOAD_BATCH_SIZE = 50;
const UPLOAD_FLUSH_MS = 1200;

const crawlsByTabId = new Map();
const crawlsByCrawlId = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInstallId();
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

  if (payload?.type === "GET_CONFIG") return getConfig();

  if (payload?.type === "SAVE_CONFIG") {
    const writerBase = normaliseWriterBase(payload.writerBase);
    const config = { writerBase };
    await chrome.storage.local.set({ [STORAGE_KEYS.config]: config });
    return config;
  }

  if (payload?.type === "GET_STATE") {
    return Number.isInteger(tabId) ? getState(tabId) : DEFAULT_STATE;
  }

  if (payload?.type === "START_PAGE_CRAWL") {
    const pageUrl = String(payload.pageUrl || "");
    const writerBase = normaliseWriterBase(payload.writerBase);

    if (!Number.isInteger(tabId) || !isRedditUrl(pageUrl)) {
      return Number.isInteger(tabId)
        ? setState(tabId, { ...DEFAULT_STATE, tabId, status: "error", message: "Open a Reddit page before crawling." })
        : { ...DEFAULT_STATE, status: "error", message: "Open a Reddit page before crawling." };
    }

    const existing = crawlsByTabId.get(tabId);
    if (existing && !existing.finalising) {
      return setState(tabId, {
        status: "error",
        message: "This tab already has a crawl running. Stop it before starting another.",
      });
    }

    const initialState = await setState(tabId, {
      ...DEFAULT_STATE,
      tabId,
      writerBase,
      pageUrl,
      status: "running",
      message: "Starting local DOM crawl...",
    });

    runPageCrawl(tabId, initialState).catch(async (error) => {
      const crawl = crawlsByTabId.get(tabId);
      if (crawl) {
        crawl.stopRequested = true;
        crawl.scrollComplete = true;
      }
      await setState(tabId, { status: "error", message: String(error?.message || error) });
    });

    return initialState;
  }

  if (payload?.type === "STOP_PAGE_CRAWL") {
    if (!Number.isInteger(tabId)) return { ...DEFAULT_STATE, status: "error", message: "Missing tab id." };

    const crawl = crawlsByTabId.get(tabId);
    if (!crawl) return setState(tabId, { status: "idle", message: "No crawl is running for this tab." });

    crawl.stopRequested = true;
    await requestPageCrawlerStop(tabId);

    return setState(tabId, {
      status: "running",
      message: "Stopping scroll and finishing queued DB writes...",
    });
  }

  if (payload?.type === "PAGE_CRAWL_POSTS") {
    handlePagePosts(payload).catch(() => {});
    return { ok: true };
  }

  if (payload?.type === "PAGE_CRAWL_PROGRESS") {
    handlePageProgress(payload).catch(() => {});
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

  return Number.isInteger(tabId) ? getState(tabId) : DEFAULT_STATE;
}

async function runPageCrawl(tabId, initialState) {
  const installId = await ensureInstallId();

  await getJson(`${initialState.writerBase}/health`);

  const sessionResponse = await postJson(`${initialState.writerBase}/session/start`, {
    extensionInstallId: installId,
    sourceUrl: initialState.pageUrl,
    clientVersion: chrome.runtime.getManifest().version,
    pageTitle: "",
  });

  const state = await setState(tabId, {
    ...initialState,
    sessionId: sessionResponse.session.id,
    uploadToken: sessionResponse.uploadToken,
    message: "Scrolling and writing parsed posts locally...",
  });

  const crawl = createCrawl(tabId, state);
  crawlsByTabId.set(tabId, crawl);
  crawlsByCrawlId.set(crawl.id, crawl);

  try {
    await startStreamingDomCrawler(tabId, {
      crawlId: crawl.id,
      waitMs: 900,
      stableRounds: 20,
      maxScrolls: 2500,
    });
  } catch (error) {
    crawlsByTabId.delete(tabId);
    crawlsByCrawlId.delete(crawl.id);
    throw error;
  }
}

function createCrawl(tabId, state) {
  return {
    id: crypto.randomUUID(),
    tabId,
    state,
    seenPostIds: new Set(),
    postBatch: [],
    uploadInFlight: false,
    scrollComplete: false,
    finalising: false,
    stopRequested: false,
    latestScrolls: 0,
    latestPostsParsed: 0,
    latestPostsSaved: 0,
    flushTimer: null,
  };
}

function getCrawlById(crawlId) {
  if (typeof crawlId !== "string") return null;
  return crawlsByCrawlId.get(crawlId) || null;
}

function isActiveCrawl(crawl) {
  return Boolean(crawl && crawlsByCrawlId.get(crawl.id) === crawl && crawlsByTabId.get(crawl.tabId) === crawl);
}

async function handlePagePosts(payload) {
  const crawl = getCrawlById(payload.crawlId);
  if (!isActiveCrawl(crawl) || crawl.finalising) return;

  const posts = Array.isArray(payload.posts) ? payload.posts : [];
  let added = 0;

  for (const post of posts) {
    if (!post?.id || crawl.seenPostIds.has(post.id)) continue;
    crawl.seenPostIds.add(post.id);
    crawl.postBatch.push(post);
    added++;
  }

  crawl.latestScrolls = Number(payload.scrolls) || crawl.latestScrolls;
  crawl.latestPostsParsed = Math.max(crawl.latestPostsParsed, Number(payload.totalPosts) || crawl.seenPostIds.size);

  crawl.state = await setState(crawl.tabId, {
    scrolls: crawl.latestScrolls,
    postsParsed: crawl.latestPostsParsed,
    postsSaved: crawl.latestPostsSaved,
    message: added
      ? `Parsed ${added} new post${added === 1 ? "" : "s"}. Writing local DB batches...`
      : `Scrolling... ${crawl.latestPostsParsed} posts parsed.`,
  });

  maybeFlushUpload(crawl);
  maybeFinalizeCrawl(crawl);
}

async function handlePageProgress(payload) {
  const crawl = getCrawlById(payload.crawlId);
  if (!isActiveCrawl(crawl) || crawl.finalising) return;

  crawl.latestScrolls = Number(payload.scrolls) || crawl.latestScrolls;
  crawl.latestPostsParsed = Math.max(crawl.latestPostsParsed, Number(payload.totalPosts) || crawl.seenPostIds.size);

  crawl.state = await setState(crawl.tabId, {
    scrolls: crawl.latestScrolls,
    postsParsed: crawl.latestPostsParsed,
    postsSaved: crawl.latestPostsSaved,
    message: `Scrolling... ${crawl.latestPostsParsed} posts parsed, ${crawl.latestPostsSaved} saved.`,
  });
}

async function handlePageDone(payload) {
  const crawl = getCrawlById(payload.crawlId);
  if (!isActiveCrawl(crawl)) return;

  crawl.scrollComplete = true;
  crawl.stopRequested = payload.stopped === true || crawl.stopRequested;
  crawl.latestScrolls = Number(payload.scrolls) || crawl.latestScrolls;
  crawl.latestPostsParsed = Math.max(crawl.latestPostsParsed, Number(payload.totalPosts) || crawl.seenPostIds.size);

  crawl.state = await setState(crawl.tabId, {
    scrolls: crawl.latestScrolls,
    postsParsed: crawl.latestPostsParsed,
    postsSaved: crawl.latestPostsSaved,
    message: "Reached the end of lazy loading. Finishing local DB writes...",
  });

  maybeFlushUpload(crawl);
  maybeFinalizeCrawl(crawl);
}

async function handlePageError(payload) {
  const crawl = getCrawlById(payload.crawlId);
  if (!isActiveCrawl(crawl)) return;

  crawl.scrollComplete = true;
  crawl.stopRequested = true;
  crawl.state = await setState(crawl.tabId, {
    status: "error",
    message: `Page crawler stopped: ${String(payload.error || "unknown error")}`,
  });

  maybeFinalizeCrawl(crawl);
}

function scheduleUploadFlush(crawl) {
  if (!isActiveCrawl(crawl) || crawl.flushTimer || crawl.postBatch.length === 0) return;

  crawl.flushTimer = setTimeout(() => {
    if (!isActiveCrawl(crawl)) return;
    crawl.flushTimer = null;
    maybeFlushUpload(crawl);
  }, UPLOAD_FLUSH_MS);
}

function maybeFlushUpload(crawl) {
  if (!isActiveCrawl(crawl) || crawl.uploadInFlight || crawl.postBatch.length === 0) {
    if (crawl?.postBatch?.length > 0) scheduleUploadFlush(crawl);
    return;
  }

  const posts = crawl.postBatch.splice(0, UPLOAD_BATCH_SIZE);
  crawl.uploadInFlight = true;

  uploadPosts(crawl.state, posts, false)
    .then(async (result) => {
      if (!isActiveCrawl(crawl)) return;

      crawl.latestPostsSaved = Number(result.session?.postsReceived) || crawl.latestPostsSaved;
      crawl.state = await setState(crawl.tabId, {
        postsSaved: crawl.latestPostsSaved,
        message: `Writing local DB... ${crawl.latestPostsSaved} saved from ${crawl.latestPostsParsed} parsed.`,
      });
    })
    .catch(async (error) => {
      if (!isActiveCrawl(crawl)) return;
      crawl.stopRequested = true;
      crawl.scrollComplete = true;
      crawl.state = await setState(crawl.tabId, {
        status: "error",
        message: String(error?.message || error),
      });
    })
    .finally(() => {
      if (!isActiveCrawl(crawl)) return;
      crawl.uploadInFlight = false;
      if (crawl.postBatch.length > 0) maybeFlushUpload(crawl);
      maybeFinalizeCrawl(crawl);
    });
}

function maybeFinalizeCrawl(crawl) {
  if (!isActiveCrawl(crawl) || crawl.finalising) return;
  if (!crawl.scrollComplete && !crawl.stopRequested) return;
  if (crawl.uploadInFlight) return;

  crawl.finalising = true;

  if (crawl.flushTimer) {
    clearTimeout(crawl.flushTimer);
    crawl.flushTimer = null;
  }

  const posts = crawl.postBatch.splice(0);

  uploadPosts(crawl.state, posts, true)
    .then(async (result) => {
      if (!isActiveCrawl(crawl)) return;

      crawl.latestPostsSaved = Number(result.session?.postsReceived) || crawl.latestPostsSaved;

      await postJson(`${crawl.state.writerBase}/session/complete`, {
        sessionId: crawl.state.sessionId,
        uploadToken: crawl.state.uploadToken,
        status: crawl.stopRequested ? "stopped" : "completed",
      }).catch(() => {});

      await setState(crawl.tabId, {
        status: crawl.stopRequested ? "idle" : "completed",
        scrolls: crawl.latestScrolls,
        postsParsed: crawl.latestPostsParsed,
        postsSaved: crawl.latestPostsSaved,
        message: crawl.stopRequested
          ? `Stopped. Saved ${crawl.latestPostsSaved} posts.`
          : `Completed. Saved ${crawl.latestPostsSaved} posts from ${crawl.latestPostsParsed} parsed cards.`,
      });
    })
    .catch(async (error) => {
      if (isActiveCrawl(crawl)) {
        await setState(crawl.tabId, { status: "error", message: String(error?.message || error) });
      }
    })
    .finally(() => {
      crawlsByCrawlId.delete(crawl.id);
      if (crawlsByTabId.get(crawl.tabId) === crawl) crawlsByTabId.delete(crawl.tabId);
    });
}

async function startStreamingDomCrawler(tabId, options) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: startRedditDomCrawler,
    args: [options],
  });
}

async function requestPageCrawlerStop(tabId) {
  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => {
        if (window.__paidPolitelyDomCrawler) window.__paidPolitelyDomCrawler.stopped = true;
      },
    })
    .catch(() => {});
}

function startRedditDomCrawler(options) {
  const crawlId = options?.crawlId;
  const waitMs = options?.waitMs || 900;
  const stableRoundsTarget = options?.stableRounds || 20;
  const maxScrolls = options?.maxScrolls || 2500;

  if (!crawlId) {
    chrome.runtime.sendMessage({ type: "PAGE_CRAWL_ERROR", error: "Missing crawl id" }).catch(() => {});
    return;
  }

  if (window.__paidPolitelyDomCrawler) window.__paidPolitelyDomCrawler.stopped = true;

  const crawler = {
    crawlId,
    stopped: false,
    seen: new Set(),
    scrolls: 0,
    stableRounds: 0,
    previousHeight: 0,
  };

  window.__paidPolitelyDomCrawler = crawler;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function send(message) {
    chrome.runtime.sendMessage({ crawlId, ...message }).catch(() => {});
  }

  function collectNewPosts() {
    const posts = [];

    for (const card of document.querySelectorAll("shreddit-post")) {
      const post = parsePostCard(card);
      if (!post || crawler.seen.has(post.id)) continue;

      crawler.seen.add(post.id);
      posts.push(post);
    }

    if (posts.length > 0) {
      send({
        type: "PAGE_CRAWL_POSTS",
        posts,
        scrolls: crawler.scrolls,
        totalPosts: crawler.seen.size,
      });
    }

    return posts.length;
  }

  function parsePostCard(card) {
    const fullId = cleanText(card.getAttribute("id"));
    const id = cleanRedditId(fullId);
    const title = cleanText(card.getAttribute("post-title")) || cleanText(card.querySelector('[slot="title"], h3')?.textContent);
    const author = cleanAuthor(card.getAttribute("author"));
    const subreddit = cleanSubreddit(
      card.getAttribute("subreddit-prefixed-name") ||
        card.getAttribute("subreddit-name") ||
        card.querySelector('[data-testid="subreddit-name"]')?.textContent ||
        inferSubreddit(card.getAttribute("permalink") || "")
    );

    if (!id || !title || !author || !subreddit) return null;

    const permalink = normalisePermalink(card.getAttribute("permalink") || card.querySelector('a[href*="/comments/"]')?.getAttribute("href") || "");
    const createdUtc = parseCreatedUtc(card.getAttribute("created-timestamp") || card.querySelector("time")?.getAttribute("datetime"));
    const media = extractMedia(card, permalink);

    return {
      id,
      name: `t3_${id}`,
      subreddit,
      title,
      selftext: cleanText(
        card.querySelector('[slot="text-body"], [data-click-id="text"], .rtjson, shreddit-post-body')?.textContent
      ),
      author,
      link_flair_text: extractFlair(card),
      score: parseCount(card.getAttribute("score")),
      upvoteCount: parseCount(card.getAttribute("score")),
      upvote_ratio: parseFloatOrNull(card.getAttribute("upvote-ratio")),
      num_comments: parseCount(card.getAttribute("comment-count")),
      shareCount: null,
      crosspostCount: 0,
      mediaUrls: media.mediaUrls,
      imageUrls: media.imageUrls,
      outboundUrl: media.outboundUrl,
      thumbnailUrl: media.thumbnailUrl,
      permalink,
      created_utc: createdUtc,
      rawJson: {
        source: "reddit-dom",
        postType: card.getAttribute("post-type") || null,
        domain: card.getAttribute("domain") || null,
        contentHref: card.getAttribute("content-href") || null,
        parsedAt: new Date().toISOString(),
      },
    };
  }

  function extractMedia(card, permalink) {
    const bucket = new Map();
    const contentHref = normaliseUrl(card.getAttribute("content-href"));
    const postType = String(card.getAttribute("post-type") || "").toLowerCase();

    const add = (raw, options = {}) => {
      const url = normaliseUrl(raw);
      if (!url || isIgnoredMediaUrl(url)) return;

      const key = mediaKey(url);
      const existing = bucket.get(key);
      const candidate = {
        url,
        isImage: options.isImage ?? isImageLikeUrl(url),
        isVideo: options.isVideo ?? isVideoLikeUrl(url),
        width: options.width || widthFromUrl(url) || 0,
        directScore: directnessScore(url, options),
      };

      if (!existing || rankMedia(candidate) > rankMedia(existing)) bucket.set(key, candidate);
    };

    if (contentHref) {
      add(contentHref, {
        isImage: isImageLikeUrl(contentHref) || postType === "image",
        isVideo: isVideoLikeUrl(contentHref) || postType === "video" || isRedgifsUrl(contentHref),
        width: 99999,
        direct: true,
      });

      const redgifsIframe = toRedgifsIframeUrl(contentHref);
      if (redgifsIframe) add(redgifsIframe, { isVideo: true, direct: true, width: 99999 });
    }

    for (const embed of card.querySelectorAll("shreddit-embed")) {
      add(embed.getAttribute("src"), { isVideo: true, direct: true, width: 99999 });
      const html = embed.getAttribute("html") || "";
      for (const url of urlsFromText(html)) {
        add(url, { isVideo: isVideoLikeUrl(url) || isRedgifsUrl(url), direct: true, width: 99999 });
      }
    }

    for (const player of card.querySelectorAll("shreddit-player")) {
      for (const attr of [
        "src",
        "poster",
        "preview",
        "playback-url",
        "fallback-url",
        "hls-url",
        "dash-url",
        "scrubber-media-url",
        "video-url",
        "poster-url",
      ]) {
        add(player.getAttribute(attr), {
          isImage: attr.includes("poster") || attr.includes("preview"),
          isVideo: !attr.includes("poster") && !attr.includes("preview"),
          direct: true,
          width: 99999,
        });
      }

      for (const value of Object.values(player.dataset || {})) {
        for (const url of urlsFromText(value)) add(url, { direct: true });
      }
    }

    for (const video of card.querySelectorAll("video")) {
      add(video.getAttribute("src"), { isVideo: true, direct: true, width: 99999 });
      add(video.getAttribute("poster"), { isImage: true, width: 99999 });
    }

    for (const source of card.querySelectorAll("source")) {
      add(source.getAttribute("src"), { isVideo: true, direct: true, width: 99999 });
      add(source.getAttribute("srcset"), { isImage: true });
    }

    for (const img of card.querySelectorAll("img")) {
      if (shouldIgnoreImageElement(img)) continue;

      const bestSrcset = bestUrlFromSrcset(img.getAttribute("srcset"));
      if (bestSrcset) add(bestSrcset.url, { isImage: true, width: bestSrcset.width });

      const src = img.currentSrc || img.getAttribute("src");
      add(src, { isImage: true, width: Number(img.getAttribute("width")) || widthFromUrl(src) || 0 });
    }

    // Fallback regex pass for current Reddit server-rendered media.
    for (const url of urlsFromText(card.innerHTML)) {
      if (!isLikelyPostMediaUrl(url)) continue;
      add(url, { isImage: isImageLikeUrl(url), isVideo: isVideoLikeUrl(url) || isRedgifsUrl(url) });
    }

    const values = [...bucket.values()].sort((a, b) => rankMedia(b) - rankMedia(a));
    const mediaUrls = values.map((item) => item.url);
    const imageUrls = values.filter((item) => item.isImage).map((item) => item.url);

    return {
      mediaUrls,
      imageUrls,
      outboundUrl: contentHref && stripUrlQuery(contentHref) !== stripUrlQuery(permalink) ? contentHref : mediaUrls[0] || null,
      thumbnailUrl: imageUrls[0] || null,
    };
  }

  function directnessScore(url, options) {
    if (options.direct) return 1000000;
    try {
      const parsed = new URL(url);
      if (/^i\.redd\.it$/i.test(parsed.hostname)) return 900000;
      if (/redgifs\.com$/i.test(parsed.hostname)) return 850000;
      if (/^v\.redd\.it$/i.test(parsed.hostname)) return 800000;
      if (/^preview\.redd\.it$/i.test(parsed.hostname)) return 500000;
      return 100000;
    } catch {
      return 0;
    }
  }

  function rankMedia(item) {
    return item.directScore + item.width;
  }

  function shouldIgnoreImageElement(img) {
    const src = normaliseUrl(img.currentSrc || img.getAttribute("src"));
    if (!src) return true;
    if (isIgnoredMediaUrl(src)) return true;

    const className = String(img.className || "");
    if (/subreddit-icon|avatar|snoovatar|emoji|award|flair/i.test(className)) return true;

    const width = Number(img.getAttribute("width") || img.naturalWidth || 0);
    const height = Number(img.getAttribute("height") || img.naturalHeight || 0);
    if (width > 0 && height > 0 && width <= 64 && height <= 64 && !/redd\.it/i.test(src)) return true;

    return false;
  }

  function isIgnoredMediaUrl(value) {
    try {
      const url = new URL(decodeHtml(value));
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();

      if (host.includes("redditstatic.com")) return true;
      if (host.includes("emoji.redditmedia.com")) return true;
      if (path.includes("/snoovatar/avatars/")) return true;
      if (path.includes("/styles/communityicon_")) return true;
      if (path.includes("/styles/profileicon_")) return true;

      return false;
    } catch {
      return true;
    }
  }

  function isLikelyPostMediaUrl(value) {
    try {
      const url = new URL(decodeHtml(value));
      const host = url.hostname.toLowerCase();
      if (["i.redd.it", "preview.redd.it", "external-preview.redd.it", "v.redd.it"].includes(host)) return true;
      if (host.endsWith("redgifs.com")) return true;
      if (/\/gallery\//i.test(url.pathname)) return true;
      return false;
    } catch {
      return false;
    }
  }

  function isImageLikeUrl(value) {
    if (!value) return false;
    try {
      const url = new URL(decodeHtml(value));
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();

      return (
        ["i.redd.it", "preview.redd.it", "external-preview.redd.it"].includes(host) ||
        /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(path)
      );
    } catch {
      return false;
    }
  }

  function isVideoLikeUrl(value) {
    if (!value) return false;
    try {
      const url = new URL(decodeHtml(value));
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();

      return host === "v.redd.it" || host.endsWith("redgifs.com") || /\.(?:mp4|m3u8|webm|mov)(?:$|[?#])/i.test(path);
    } catch {
      return false;
    }
  }

  function isRedgifsUrl(value) {
    try {
      return new URL(decodeHtml(value)).hostname.toLowerCase().endsWith("redgifs.com");
    } catch {
      return false;
    }
  }

  function toRedgifsIframeUrl(value) {
    try {
      const url = new URL(decodeHtml(value));
      if (!url.hostname.toLowerCase().endsWith("redgifs.com")) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      const index = parts.findIndex((part) => ["watch", "ifr"].includes(part.toLowerCase()));
      const slug = index >= 0 ? parts[index + 1] : null;
      return slug ? `https://www.redgifs.com/ifr/${slug}` : null;
    } catch {
      return null;
    }
  }

  function bestUrlFromSrcset(value) {
    if (!value) return null;

    let best = null;
    for (const part of String(value).split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const pieces = trimmed.split(/\s+/);
      const url = normaliseUrl(pieces[0]);
      if (!url) continue;

      const widthToken = pieces.find((piece) => /^\d+w$/i.test(piece));
      const width = widthToken ? Number.parseInt(widthToken, 10) : widthFromUrl(url) || 0;
      if (!best || width > best.width) best = { url, width };
    }

    return best;
  }

  function mediaKey(value) {
    try {
      const url = new URL(decodeHtml(value));
      const host = url.hostname.toLowerCase();
      const path = url.pathname;

      if (host === "preview.redd.it") {
        const file = path.split("/").pop() || path;
        const match = file.match(/(?:^|-)v\d+-([A-Za-z0-9_-]+\.(?:jpe?g|png|gif|webp|avif))/i);
        if (match) return `${host}:${match[1].toLowerCase()}`;
        return `${host}:${file.replace(/\.(?:jpe?g|png|gif|webp|avif).*$/i, "").toLowerCase()}`;
      }

      if (host === "i.redd.it") return `${host}:${(path.split("/").pop() || path).toLowerCase()}`;

      if (host.endsWith("redgifs.com")) {
        const parts = path.split("/").filter(Boolean);
        const index = parts.findIndex((part) => ["watch", "ifr"].includes(part.toLowerCase()));
        const slug = index >= 0 ? parts[index + 1] : parts.at(-1);
        return `redgifs:${String(slug || value).toLowerCase()}`;
      }

      return `${host}:${path.replace(/\/$/, "")}`;
    } catch {
      return String(value).replace(/[?#].*$/, "");
    }
  }

  function urlsFromText(value) {
    const decoded = decodeHtml(String(value || ""));
    const urls = [];

    for (const match of decoded.matchAll(/https?:\/\/[^\s"'<>\\)]+/gi)) {
      urls.push(match[0].replace(/,$/, ""));
    }

    return urls;
  }

  function extractFlair(card) {
    const selectors = [
      "shreddit-post-flair",
      '[data-testid="post-flair"]',
      '[slot="post-flair"]',
      '[slot="flair"]',
      "faceplate-tracker[noun='post_flair']",
    ];

    for (const selector of selectors) {
      const value = cleanText(card.querySelector(selector)?.textContent);
      if (value) return value;
    }

    return null;
  }

  function parseCreatedUtc(value) {
    if (!value) return Math.floor(Date.now() / 1000);

    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
  }

  function parseCount(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    const raw = cleanText(value).toLowerCase();
    if (!raw) return 0;

    const match = raw.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!match) return 0;

    let num = Number(match[0]);
    if (!Number.isFinite(num)) return 0;

    if (raw.includes("k")) num *= 1000;
    if (raw.includes("m")) num *= 1000000;

    return Math.round(num);
  }

  function parseFloatOrNull(value) {
    const parsed = Number.parseFloat(String(value || ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function cleanAuthor(value) {
    return cleanText(value).replace(/^u\//i, "").replace(/^\/u\//i, "");
  }

  function cleanSubreddit(value) {
    return cleanText(value).replace(/^r\//i, "").replace(/^\/r\//i, "");
  }

  function cleanRedditId(value) {
    return cleanText(value).replace(/^t3_/i, "");
  }

  function inferSubreddit(permalink) {
    return String(permalink || "").match(/\/r\/([^/]+)/i)?.[1] || "";
  }

  function normalisePermalink(value) {
    const raw = cleanText(value);
    if (!raw) return location.href;
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://www.reddit.com${raw.startsWith("/") ? raw : `/${raw}`}`;
  }

  function normaliseUrl(value) {
    const raw = decodeHtml(cleanText(value));
    if (!raw) return null;

    try {
      return new URL(raw, location.href).toString();
    } catch {
      return null;
    }
  }

  function widthFromUrl(value) {
    try {
      const url = new URL(decodeHtml(value));
      return Number.parseInt(url.searchParams.get("width") || "", 10) || 0;
    } catch {
      return 0;
    }
  }

  function stripUrlQuery(value) {
    try {
      const url = new URL(value, location.href);
      return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
    } catch {
      return String(value || "").replace(/[?#].*$/, "").replace(/\/$/, "");
    }
  }

  function decodeHtml(value) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value || "");
    return textarea.value;
  }

  async function run() {
    try {
      collectNewPosts();

      while (!crawler.stopped && crawler.scrolls < maxScrolls && crawler.stableRounds < stableRoundsTarget) {
        const beforePosts = crawler.seen.size;
        const beforeHeight = document.documentElement.scrollHeight;

        window.scrollTo({ top: beforeHeight, behavior: "auto" });
        await sleep(waitMs);
        const newAtBottom = collectNewPosts();

        window.scrollBy({ top: Math.max(500, Math.round(window.innerHeight * 0.95)), behavior: "auto" });
        await sleep(waitMs);
        const newAfterNudge = collectNewPosts();

        crawler.scrolls++;

        const afterHeight = document.documentElement.scrollHeight;
        const atBottom = Math.ceil(window.scrollY + window.innerHeight) >= afterHeight - 8;
        const noNewHeight = afterHeight === beforeHeight && afterHeight === crawler.previousHeight;
        const noNewPosts = crawler.seen.size === beforePosts && newAtBottom === 0 && newAfterNudge === 0;

        crawler.stableRounds = atBottom && noNewHeight && noNewPosts ? crawler.stableRounds + 1 : 0;
        crawler.previousHeight = afterHeight;

        send({ type: "PAGE_CRAWL_PROGRESS", scrolls: crawler.scrolls, totalPosts: crawler.seen.size });
      }

      collectNewPosts();
      send({ type: "PAGE_CRAWL_DONE", scrolls: crawler.scrolls, totalPosts: crawler.seen.size, stopped: crawler.stopped });
    } catch (error) {
      send({ type: "PAGE_CRAWL_ERROR", error: String(error?.message || error) });
    }
  }

  run();
}

async function uploadPosts(state, posts, completed) {
  return postJson(`${state.writerBase}/posts/stream`, {
    sessionId: state.sessionId,
    uploadToken: state.uploadToken,
    posts,
    completed,
  });
}

async function getJson(url) {
  const response = await fetch(url, { method: "GET" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `Request failed with ${response.status}`);
  return json;
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
  const data = await chrome.storage.local.get({
    [STORAGE_KEYS.config]: { writerBase: DEFAULT_WRITER_BASE },
  });

  const config = data[STORAGE_KEYS.config] || {};
  return {
    writerBase: normaliseWriterBase(config.writerBase),
  };
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
  chrome.runtime.sendMessage({ type: "CRAWL_STATE", tabId, state: next }).catch(() => {});

  return next;
}

function normaliseWriterBase(value) {
  return String(value || DEFAULT_WRITER_BASE).replace(/\/+$/, "");
}

function isRedditUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)reddit\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}
