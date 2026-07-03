const STORAGE_KEYS = {
  installId: "installId",
  statePrefix: "syncState:",
  subredditCycleConfig: "subredditCycleConfig",
  subredditCycleProgress: "subredditCycleProgress",
  urlScanHistory: "urlScanHistory",
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
  tabId: null,
  cyclePhase: "idle",
  activeSubreddit: "",
  activeSort: "",
  completedUrls: 0,
  skippedUrls: 0,
  totalUrls: 0,
};

const FETCH_CONCURRENCY = 4;
const UPLOAD_BATCH_SIZE = 25;
const UPLOAD_FLUSH_MS = 2500;
const SCAN_COOLDOWN_MS = 60 * 60 * 1000;
const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const IDLE_CYCLE_WAIT_MS = 60 * 1000;
const LOAD_SETTLE_MS = 2000;

const INITIAL_SORTS = ["hot", "best", "new", "top"];
const ONGOING_SORTS = ["new"];

const pipelinesByTabId = new Map();
const pipelinesByCrawlId = new Map();
const cyclesByTabId = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInstallId();
});

chrome.runtime.onMessage.addListener((payload, _sender, sendResponse) => {
  handleMessage(payload).then(sendResponse).catch((error) => {
    sendResponse({ ...DEFAULT_STATE, status: "error", message: String(error?.message || error) });
  });
  return true;
});

async function handleMessage(payload) {
  const tabId = Number(payload?.tabId);

  if (payload?.type === "GET_STATE") {
    return Number.isInteger(tabId) ? getState(tabId) : DEFAULT_STATE;
  }

  if (payload?.type === "GET_SUBREDDIT_CYCLE_CONFIG") {
    return getSubredditCycleConfig();
  }

  if (payload?.type === "SAVE_SUBREDDIT_CYCLE_CONFIG") {
    const apiBase = String(payload.apiBase || DEFAULT_STATE.apiBase).replace(/\/+$/, "");
    const subreddits = parseSubredditList(payload.subreddits || []);
    const config = await setSubredditCycleConfig({ apiBase, subreddits });
    return { ok: true, config };
  }

  if (payload?.type === "START_PAGE_CRAWL") {
    const pageUrl = String(payload.pageUrl || "");
    const apiBase = String(payload.apiBase || DEFAULT_STATE.apiBase).replace(/\/+$/, "");

    if (!Number.isInteger(tabId) || !isRedditUrl(pageUrl)) {
      return Number.isInteger(tabId)
        ? setState(tabId, { ...DEFAULT_STATE, status: "error", message: "Open a Reddit page before crawling." })
        : { ...DEFAULT_STATE, status: "error", message: "Open a Reddit page before crawling." };
    }

    if (cyclesByTabId.has(tabId)) {
      return setState(tabId, {
        status: "error",
        message: "This tab has a subreddit cycle running. Stop it before starting a page crawl.",
      });
    }

    const existingPipeline = pipelinesByTabId.get(tabId);
    if (existingPipeline && !existingPipeline.finalising) {
      return setState(tabId, {
        status: "error",
        message: "This tab already has a crawl running. Stop it before starting another.",
      });
    }

    const state = await setState(tabId, {
      ...DEFAULT_STATE,
      tabId,
      status: "running",
      mode: "page",
      apiBase,
      pageUrl,
      username: inferUsernameFromUrl(pageUrl) || inferSubreddit(pageUrl) || "",
      pagesScanned: 0,
      postsSynced: 0,
      message: "Starting concurrent scroll, parse, and upload...",
    });

    runPageCrawl(tabId, state).catch(async (error) => {
      const activePipeline = pipelinesByTabId.get(tabId);
      if (activePipeline) {
        activePipeline.stopRequested = true;
        activePipeline.scrollComplete = true;
      }

      await setState(tabId, { status: "error", message: String(error?.message || error) });
    });

    return state;
  }

  if (payload?.type === "START_SUBREDDIT_CYCLE") {
    if (!Number.isInteger(tabId)) {
      return { ...DEFAULT_STATE, status: "error", message: "Missing tab id." };
    }

    const apiBase = String(payload.apiBase || DEFAULT_STATE.apiBase).replace(/\/+$/, "");
    const subreddits = parseSubredditList(payload.subreddits || []);

    if (subreddits.length === 0) {
      return setState(tabId, {
        ...DEFAULT_STATE,
        tabId,
        status: "error",
        message: "Add at least one subreddit before starting the cycle.",
      });
    }

    if (cyclesByTabId.has(tabId)) {
      return setState(tabId, {
        status: "error",
        message: "This tab already has a subreddit cycle running.",
      });
    }

    const existingPipeline = pipelinesByTabId.get(tabId);
    if (existingPipeline && !existingPipeline.finalising) {
      return setState(tabId, {
        status: "error",
        message: "This tab already has a crawl running. Stop it before starting the cycle.",
      });
    }

    await setSubredditCycleConfig({ apiBase, subreddits });

    const state = await setState(tabId, {
      ...DEFAULT_STATE,
      tabId,
      status: "running",
      mode: "cycle",
      apiBase,
      pageUrl: "",
      username: "subreddit-cycle",
      pagesScanned: 0,
      postsSynced: 0,
      cyclePhase: "starting",
      completedUrls: 0,
      skippedUrls: 0,
      totalUrls: 0,
      message: `Starting subreddit cycle for ${subreddits.length} subreddit${subreddits.length === 1 ? "" : "s"}...`,
    });

    runSubredditCycle(tabId, { apiBase, subreddits }).catch(async (error) => {
      cyclesByTabId.delete(tabId);
      await setState(tabId, { status: "error", message: String(error?.message || error) });
    });

    return state;
  }

  if (payload?.type === "STOP_SYNC") {
    if (!Number.isInteger(tabId)) {
      return { ...DEFAULT_STATE, status: "error", message: "Missing tab id." };
    }

    const cycle = cyclesByTabId.get(tabId);
    if (cycle) {
      cycle.stopRequested = true;
      if (cycle.idleTimer) clearTimeout(cycle.idleTimer);
    }

    const pipeline = pipelinesByTabId.get(tabId);
    if (pipeline) {
      pipeline.stopRequested = true;
      await requestPageCrawlerStop(tabId);
      return setState(tabId, {
        status: "running",
        message: cycle
          ? "Stopping subreddit cycle and finishing queued uploads..."
          : "Stopping scroll and finishing queued uploads...",
      });
    }

    if (cycle) {
      cyclesByTabId.delete(tabId);
      return setState(tabId, {
        status: "idle",
        message: "Subreddit cycle stopped.",
      });
    }

    return setState(tabId, {
      status: "idle",
      message: "No crawl is running for this tab.",
    });
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

  return Number.isInteger(tabId) ? getState(tabId) : DEFAULT_STATE;
}

async function runSubredditCycle(tabId, config) {
  const subreddits = parseSubredditList(config.subreddits);
  const fingerprint = subreddits.join("|").toLowerCase();
  const progress = await getSubredditCycleProgress();
  const initialAlreadyCompleted = progress.fingerprint === fingerprint && progress.initialCompleted === true;

  const cycle = {
    id: crypto.randomUUID(),
    tabId,
    apiBase: config.apiBase,
    subreddits,
    fingerprint,
    stopRequested: false,
    idleTimer: null,
    completedUrls: 0,
    skippedUrls: 0,
    totalPostsSynced: 0,
  };

  cyclesByTabId.set(tabId, cycle);

  try {
    if (!initialAlreadyCompleted) {
      const initialUrls = buildScanQueue(subreddits, INITIAL_SORTS);
      await setState(tabId, {
        status: "running",
        mode: "cycle",
        cyclePhase: "initial",
        totalUrls: initialUrls.length,
        completedUrls: 0,
        skippedUrls: 0,
        message: `Initial pass: scanning hot, best, new, and top for ${subreddits.length} subreddit${subreddits.length === 1 ? "" : "s"}.`,
      });

      await runScanQueue(cycle, initialUrls, "initial");

      if (cycle.stopRequested) return;

      await setSubredditCycleProgress({ fingerprint, initialCompleted: true, completedAt: Date.now() });
      await setState(tabId, {
        cyclePhase: "new",
        message: "Initial pass complete. Switching to new-only cycle.",
      });
    }

    while (!cycle.stopRequested) {
      const newUrls = buildScanQueue(subreddits, ONGOING_SORTS);

      await setState(tabId, {
        status: "running",
        mode: "cycle",
        cyclePhase: "new",
        totalUrls: newUrls.length,
        completedUrls: 0,
        skippedUrls: 0,
        message: `New-only cycle: checking ${newUrls.length} subreddit URL${newUrls.length === 1 ? "" : "s"}.`,
      });

      cycle.completedUrls = 0;
      cycle.skippedUrls = 0;
      await runScanQueue(cycle, newUrls, "new");

      if (cycle.stopRequested) return;

      const scannedThisRound = cycle.completedUrls;
      if (scannedThisRound <= 0) {
        await setState(tabId, {
          status: "running",
          mode: "cycle",
          cyclePhase: "waiting",
          message: "All new URLs were scanned less than an hour ago. Waiting before checking again...",
        });
        await waitForCycleIdle(cycle, IDLE_CYCLE_WAIT_MS);
      }
    }
  } finally {
    if (cycle.idleTimer) clearTimeout(cycle.idleTimer);
    cyclesByTabId.delete(tabId);

    const current = await getState(tabId);
    if (current.status === "running" || current.mode === "cycle") {
      await setState(tabId, {
        status: "idle",
        mode: "cycle",
        cyclePhase: "idle",
        message: cycle.stopRequested ? "Subreddit cycle stopped." : "Subreddit cycle finished.",
      });
    }
  }
}

async function runScanQueue(cycle, scanQueue, phase) {
  const total = scanQueue.length;

  for (let index = 0; index < scanQueue.length; index++) {
    if (cycle.stopRequested) return;

    const scan = scanQueue[index];
    const cooldown = await getUrlCooldown(scan.url);

    if (cooldown.remainingMs > 0) {
      cycle.skippedUrls++;
      await setState(cycle.tabId, {
        mode: "cycle",
        cyclePhase: phase,
        activeSubreddit: scan.subreddit,
        activeSort: scan.sort,
        totalUrls: total,
        completedUrls: cycle.completedUrls,
        skippedUrls: cycle.skippedUrls,
        message: `Skipping r/${scan.subreddit}/${scan.sort}; scanned ${formatDuration(cooldown.ageMs)} ago.`,
      });
      continue;
    }

    await setState(cycle.tabId, {
      status: "running",
      mode: "cycle",
      cyclePhase: phase,
      activeSubreddit: scan.subreddit,
      activeSort: scan.sort,
      totalUrls: total,
      completedUrls: cycle.completedUrls,
      skippedUrls: cycle.skippedUrls,
      pageUrl: scan.url,
      message: `${phase === "initial" ? "Initial pass" : "New-only cycle"}: opening r/${scan.subreddit}/${scan.sort} (${index + 1}/${total})...`,
    });

    await navigateTabAndWait(cycle.tabId, scan.url);

    if (cycle.stopRequested) return;

    const currentState = await getState(cycle.tabId);
    const crawlState = {
      ...currentState,
      status: "running",
      mode: "cycle",
      apiBase: cycle.apiBase,
      pageUrl: scan.url,
      username: scan.subreddit,
      activeSubreddit: scan.subreddit,
      activeSort: scan.sort,
      message: `Scanning r/${scan.subreddit}/${scan.sort}...`,
    };

    await setState(cycle.tabId, crawlState);

    const result = await runPageCrawl(cycle.tabId, crawlState, {
      postCountOffset: cycle.totalPostsSynced,
      crawlerOptions: {
        waitMs: 1500,
        stableRounds: phase === "initial" ? 25 : 15,
        maxScrolls: phase === "initial" ? 2500 : 600,
      },
    });

    cycle.totalPostsSynced += result.postsReceived || 0;
    cycle.completedUrls++;
    await markUrlScanned(scan.url);

    await setState(cycle.tabId, {
      status: "running",
      mode: "cycle",
      cyclePhase: phase,
      postsSynced: cycle.totalPostsSynced,
      completedUrls: cycle.completedUrls,
      skippedUrls: cycle.skippedUrls,
      totalUrls: total,
      message: `Finished r/${scan.subreddit}/${scan.sort}. Synced ${cycle.totalPostsSynced} posts this cycle.`,
    });
  }
}

function buildScanQueue(subreddits, sorts) {
  const queue = [];

  for (const subreddit of subreddits) {
    for (const sort of sorts) {
      queue.push({ subreddit, sort, url: buildSubredditUrl(subreddit, sort) });
    }
  }

  return queue;
}

function buildSubredditUrl(subreddit, sort) {
  const safeSubreddit = normaliseSubredditName(subreddit);
  const safeSort = String(sort || "new").toLowerCase();

  if (safeSort === "top") return `https://www.reddit.com/r/${safeSubreddit}/top/?t=all`;
  return `https://www.reddit.com/r/${safeSubreddit}/${safeSort}/`;
}

async function navigateTabAndWait(tabId, url) {
  await chrome.tabs.update(tabId, { url, active: true });
  await waitForTabComplete(tabId, url, 45000);
  await sleep(LOAD_SETTLE_MS);
}

function waitForTabComplete(tabId, expectedUrl, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(new Error(`Timed out loading ${expectedUrl}`)), timeoutMs);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) reject(error);
      else resolve();
    }

    function listener(updatedTabId, changeInfo, tab) {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status !== "complete") return;

      const currentUrl = tab?.url || "";
      if (isSameScanUrl(currentUrl, expectedUrl)) finish();
    }

    chrome.tabs.onUpdated.addListener(listener);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab?.status === "complete" && isSameScanUrl(tab.url || "", expectedUrl)) finish();
    });
  });
}

function waitForCycleIdle(cycle, ms) {
  return new Promise((resolve) => {
    cycle.idleTimer = setTimeout(() => {
      cycle.idleTimer = null;
      resolve();
    }, ms);
  });
}

async function runPageCrawl(tabId, initialState, options = {}) {
  let pipelineForThisRun = null;

  try {
    const installId = await ensureInstallId();

    const sessionResponse = await postJson(`${initialState.apiBase}/api/v1/extension/sessions`, {
      crawlMode: initialState.mode === "cycle" ? "subreddit_cycle" : "page",
      redditUsername: initialState.username || undefined,
      sourceUrl: initialState.pageUrl,
      extensionInstallId: installId,
      clientVersion: chrome.runtime.getManifest().version,
    });

    const state = await setState(tabId, {
      ...initialState,
      sessionId: sessionResponse.session.id,
      uploadToken: sessionResponse.uploadToken,
      message: initialState.mode === "cycle" ? initialState.message : "Scrolling, parsing, and uploading concurrently...",
    });

    pipelineForThisRun = createPipeline(tabId, state, options.postCountOffset || 0);
    pipelinesByTabId.set(tabId, pipelineForThisRun);
    pipelinesByCrawlId.set(pipelineForThisRun.id, pipelineForThisRun);

    const crawlerOptions = options.crawlerOptions || {};
    await startStreamingPageCrawler(tabId, {
      crawlId: pipelineForThisRun.id,
      waitMs: crawlerOptions.waitMs || 1500,
      stableRounds: crawlerOptions.stableRounds || 25,
      maxScrolls: crawlerOptions.maxScrolls || 2500,
    });

    return await new Promise((resolve) => {
      pipelineForThisRun.resolveComplete = resolve;
    });
  } finally {
    if (pipelineForThisRun?.flushTimer) clearTimeout(pipelineForThisRun.flushTimer);

    if (pipelineForThisRun) {
      pipelinesByCrawlId.delete(pipelineForThisRun.id);
      if (pipelinesByTabId.get(tabId) === pipelineForThisRun) pipelinesByTabId.delete(tabId);
    }
  }
}

function createPipeline(tabId, state, postCountOffset = 0) {
  return {
    id: crypto.randomUUID(),
    tabId,
    state,
    postCountOffset,
    seenLinks: new Set(),
    linkQueue: [],
    postBatch: [],
    fetchInFlight: 0,
    uploadInFlight: false,
    scrollComplete: false,
    finalising: false,
    stopRequested: false,
    skipped: 0,
    latestScrolls: 0,
    latestPostsReceived: 0,
    flushTimer: null,
    resolveComplete: () => {},
  };
}

function getPipelineByCrawlId(crawlId) {
  if (typeof crawlId !== "string") return null;
  return pipelinesByCrawlId.get(crawlId) || null;
}

function isActivePipeline(pipeline) {
  return Boolean(
    pipeline &&
      pipelinesByCrawlId.get(pipeline.id) === pipeline &&
      pipelinesByTabId.get(pipeline.tabId) === pipeline
  );
}

async function handlePageLinks(payload) {
  const pipeline = getPipelineByCrawlId(payload.crawlId);
  if (!isActivePipeline(pipeline) || pipeline.finalising) return;

  const links = Array.isArray(payload.links) ? payload.links.filter((link) => typeof link === "string") : [];
  const newLinks = [];

  for (const link of links) {
    if (pipeline.seenLinks.has(link)) continue;
    pipeline.seenLinks.add(link);
    pipeline.linkQueue.push(link);
    newLinks.push(link);
  }

  pipeline.latestScrolls = Number(payload.scrolls) || pipeline.latestScrolls;
  const currentMessage =
    newLinks.length > 0
      ? `Scrolling... found ${pipeline.seenLinks.size} links, queued ${pipeline.linkQueue.length}.`
      : `Scrolling... parsed ${pipeline.seenLinks.size} links, uploading in parallel.`;

  pipeline.state = await setState(pipeline.tabId, {
    pagesScanned: pipeline.latestScrolls,
    postsSynced: pipeline.postCountOffset + pipeline.latestPostsReceived,
    message: pipeline.state.mode === "cycle" ? `${pipeline.state.activeSubreddit}/${pipeline.state.activeSort}: ${currentMessage}` : currentMessage,
  });

  pumpLinkQueue(pipeline);
  maybeFinalizePipeline(pipeline);
}

async function handlePageDone(payload) {
  const pipeline = getPipelineByCrawlId(payload.crawlId);
  if (!isActivePipeline(pipeline)) return;

  pipeline.scrollComplete = true;
  pipeline.latestScrolls = Number(payload.scrolls) || pipeline.latestScrolls;
  pipeline.state = await setState(pipeline.tabId, {
    pagesScanned: pipeline.latestScrolls,
    postsSynced: pipeline.postCountOffset + pipeline.latestPostsReceived,
    message: "Reached the end of lazy loading. Finishing queued uploads...",
  });

  pumpLinkQueue(pipeline);
  maybeFlushUpload(pipeline);
  maybeFinalizePipeline(pipeline);
}

async function handlePageError(payload) {
  const pipeline = getPipelineByCrawlId(payload.crawlId);
  if (!isActivePipeline(pipeline)) return;

  pipeline.scrollComplete = true;
  pipeline.stopRequested = true;
  pipeline.state = await setState(pipeline.tabId, {
    status: "error",
    message: `Page crawler stopped: ${String(payload.error || "unknown error")}`,
  });

  maybeFinalizePipeline(pipeline);
}

function pumpLinkQueue(pipeline) {
  if (!isActivePipeline(pipeline)) return;

  while (pipeline.fetchInFlight < FETCH_CONCURRENCY && pipeline.linkQueue.length > 0 && !pipeline.stopRequested) {
    const link = pipeline.linkQueue.shift();
    pipeline.fetchInFlight++;

    fetchAndQueuePost(pipeline, link)
      .catch(() => {
        if (isActivePipeline(pipeline)) pipeline.skipped++;
      })
      .finally(() => {
        if (!isActivePipeline(pipeline)) return;
        pipeline.fetchInFlight--;
        pumpLinkQueue(pipeline);
        maybeFlushUpload(pipeline);
        maybeFinalizePipeline(pipeline);
      });
  }
}

async function fetchAndQueuePost(pipeline, link) {
  if (!isActivePipeline(pipeline) || pipeline.stopRequested) return;

  const rawPost = await fetchPostFromPermalink(link);
  const normalised = normalisePost(rawPost);
  if (!normalised || !isActivePipeline(pipeline)) return;

  pipeline.postBatch.push(normalised);

  if (pipeline.postBatch.length >= UPLOAD_BATCH_SIZE) maybeFlushUpload(pipeline);
  else scheduleUploadFlush(pipeline);
}

function scheduleUploadFlush(pipeline) {
  if (!isActivePipeline(pipeline) || pipeline.flushTimer || pipeline.postBatch.length === 0) return;

  pipeline.flushTimer = setTimeout(() => {
    if (!isActivePipeline(pipeline)) return;
    pipeline.flushTimer = null;
    maybeFlushUpload(pipeline);
  }, UPLOAD_FLUSH_MS);
}

function maybeFlushUpload(pipeline) {
  if (!isActivePipeline(pipeline) || pipeline.uploadInFlight || pipeline.postBatch.length === 0) return;

  const posts = pipeline.postBatch.splice(0, UPLOAD_BATCH_SIZE);
  pipeline.uploadInFlight = true;

  uploadBatch(pipeline.state, posts, false)
    .then(async (upload) => {
      if (!isActivePipeline(pipeline)) return;
      pipeline.latestPostsReceived = Number(upload.session.postsReceived) || pipeline.latestPostsReceived;
      pipeline.state = await setState(pipeline.tabId, {
        postsSynced: pipeline.postCountOffset + pipeline.latestPostsReceived,
        message: `Scrolling, parsing, uploading... synced ${pipeline.postCountOffset + pipeline.latestPostsReceived} posts.`,
      });
    })
    .catch(async (error) => {
      if (!isActivePipeline(pipeline)) return;
      pipeline.stopRequested = true;
      pipeline.scrollComplete = true;
      pipeline.state = await setState(pipeline.tabId, {
        status: "error",
        message: String(error?.message || error),
      });
    })
    .finally(() => {
      if (!isActivePipeline(pipeline)) return;
      pipeline.uploadInFlight = false;
      if (pipeline.postBatch.length > 0) maybeFlushUpload(pipeline);
      maybeFinalizePipeline(pipeline);
    });
}

function maybeFinalizePipeline(pipeline) {
  if (!isActivePipeline(pipeline) || pipeline.finalising) return;
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
      if (!isActivePipeline(pipeline)) return;
      pipeline.latestPostsReceived = Number(upload.session.postsReceived) || pipeline.latestPostsReceived;
      const totalPosts = pipeline.postCountOffset + pipeline.latestPostsReceived;

      await setState(pipeline.tabId, {
        status: pipeline.state.mode === "cycle" ? "running" : pipeline.stopRequested ? "idle" : "completed",
        pagesScanned: pipeline.latestScrolls,
        postsSynced: totalPosts,
        message: pipeline.stopRequested
          ? `Stopped. Synced ${totalPosts} posts.`
          : `Completed. Synced ${totalPosts} posts from ${pipeline.seenLinks.size} links${
              pipeline.skipped ? `, skipped ${pipeline.skipped}` : ""
            }.`,
      });

      pipeline.resolveComplete({
        postsReceived: pipeline.latestPostsReceived,
        totalPosts,
        stopped: pipeline.stopRequested,
      });
    })
    .catch(async (error) => {
      if (isActivePipeline(pipeline)) {
        await setState(pipeline.tabId, { status: "error", message: String(error?.message || error) });
      }
      pipeline.resolveComplete({ postsReceived: pipeline.latestPostsReceived, totalPosts: pipeline.postCountOffset + pipeline.latestPostsReceived, error });
    });
}

async function startStreamingPageCrawler(tabId, options) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: startConcurrentRedditCrawler,
    args: [options],
  });
}

async function requestPageCrawlerStop(tabId) {
  await chrome.scripting
    .executeScript({
      target: { tabId },
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

  if (window.__paidPolitelyCrawler) window.__paidPolitelyCrawler.stopped = true;

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

        send({ type: "PAGE_CRAWL_LINKS", links: [], scrolls: crawler.scrolls, totalLinks: crawler.seen.size });
      }

      collectNewLinks();
      send({ type: "PAGE_CRAWL_DONE", scrolls: crawler.scrolls, totalLinks: crawler.seen.size, stopped: crawler.stopped });
    } catch (error) {
      send({ type: "PAGE_CRAWL_ERROR", error: String(error?.message || error) });
    }
  }

  run();
}

async function fetchPostFromPermalink(permalink) {
  const url = `${permalink.replace(/\/$/, "")}.json?raw_json=1`;
  const response = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });

  if (!response.ok) throw new Error(`Reddit returned ${response.status} for ${permalink}`);

  const listing = await response.json();
  const raw = listing?.[0]?.data?.children?.[0]?.data;
  if (!raw?.id) throw new Error(`Could not parse Reddit post JSON for ${permalink}`);

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
  const entries =
    galleryItems.length > 0
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
  chrome.runtime.sendMessage({ type: "SYNC_STATE", tabId, state: next }).catch(() => {});

  return next;
}

async function getSubredditCycleConfig() {
  const data = await chrome.storage.local.get({
    [STORAGE_KEYS.subredditCycleConfig]: {
      apiBase: DEFAULT_STATE.apiBase,
      subreddits: ["daresgonewild"],
    },
  });

  const config = data[STORAGE_KEYS.subredditCycleConfig] || {};
  return {
    apiBase: String(config.apiBase || DEFAULT_STATE.apiBase).replace(/\/+$/, ""),
    subreddits: parseSubredditList(config.subreddits || ["daresgonewild"]),
  };
}

async function setSubredditCycleConfig(config) {
  const next = {
    apiBase: String(config.apiBase || DEFAULT_STATE.apiBase).replace(/\/+$/, ""),
    subreddits: parseSubredditList(config.subreddits),
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.subredditCycleConfig]: next });
  return next;
}

async function getSubredditCycleProgress() {
  const data = await chrome.storage.local.get({ [STORAGE_KEYS.subredditCycleProgress]: {} });
  return data[STORAGE_KEYS.subredditCycleProgress] || {};
}

async function setSubredditCycleProgress(progress) {
  await chrome.storage.local.set({ [STORAGE_KEYS.subredditCycleProgress]: progress });
  return progress;
}

async function getUrlScanHistory() {
  const data = await chrome.storage.local.get({ [STORAGE_KEYS.urlScanHistory]: {} });
  const history = data[STORAGE_KEYS.urlScanHistory] || {};
  const now = Date.now();
  let changed = false;

  for (const [url, timestamp] of Object.entries(history)) {
    if (typeof timestamp !== "number" || now - timestamp > HISTORY_RETENTION_MS) {
      delete history[url];
      changed = true;
    }
  }

  if (changed) await chrome.storage.local.set({ [STORAGE_KEYS.urlScanHistory]: history });
  return history;
}

async function getUrlCooldown(url) {
  const history = await getUrlScanHistory();
  const key = normaliseScanUrl(url);
  const lastScannedAt = Number(history[key] || 0);
  const ageMs = lastScannedAt ? Date.now() - lastScannedAt : Infinity;
  const remainingMs = Math.max(0, SCAN_COOLDOWN_MS - ageMs);

  return { lastScannedAt, ageMs, remainingMs };
}

async function markUrlScanned(url) {
  const history = await getUrlScanHistory();
  history[normaliseScanUrl(url)] = Date.now();
  await chrome.storage.local.set({ [STORAGE_KEYS.urlScanHistory]: history });
}

function normaliseScanUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "/");

    const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [key, val] of params) url.searchParams.append(key, val);

    return url.toString();
  } catch {
    return String(value).trim();
  }
}

function isSameScanUrl(a, b) {
  return stripUrlQuery(normaliseScanUrl(a)) === stripUrlQuery(normaliseScanUrl(b));
}

function parseSubredditList(value) {
  const raw = Array.isArray(value) ? value.join("\n") : String(value || "");
  const seen = new Set();
  const subreddits = [];

  for (const part of raw.split(/[\n,\s]+/g)) {
    const subreddit = normaliseSubredditName(part);
    if (!subreddit) continue;

    const key = subreddit.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    subreddits.push(subreddit);
  }

  return subreddits;
}

function normaliseSubredditName(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:www\.)?reddit\.com\/r\//i, "")
    .replace(/^\/r\//i, "")
    .replace(/^r\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/[^A-Za-z0-9_]/g, "");

  return cleaned || "";
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "never";
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
