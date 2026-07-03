const DEFAULT_API_BASE = "https://api.paidpolitely.com";

const DEFAULT_STATE = {
  status: "idle",
  mode: "page",
  username: "",
  sessionId: "",
  uploadToken: "",
  apiBase: DEFAULT_API_BASE,
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

const apiBaseInput = document.querySelector("#apiBase");
const subredditInput = document.querySelector("#subreddits");
const startButton = document.querySelector("#start");
const startCycleButton = document.querySelector("#startCycle");
const stopButton = document.querySelector("#stop");
const message = document.querySelector("#message");
const pages = document.querySelector("#pages");
const posts = document.querySelector("#posts");
const urlsDone = document.querySelector("#urlsDone");
const statusDot = document.querySelector("#statusDot");
const pageUrl = document.querySelector("#pageUrl");

let activeTab = null;

init().catch((error) => {
  renderState({
    ...DEFAULT_STATE,
    status: "error",
    message: String(error?.message || error),
  });
});

async function init() {
  activeTab = await getActiveTab();

  const [cycleConfig, state] = await Promise.all([
    sendMessage({ type: "GET_SUBREDDIT_CYCLE_CONFIG" }).catch(() => ({
      apiBase: DEFAULT_API_BASE,
      subreddits: ["daresgonewild"],
    })),
    activeTab?.id
      ? sendMessage({ type: "GET_STATE", tabId: activeTab.id })
      : Promise.resolve({ ...DEFAULT_STATE, message: "Open a tab before crawling." }),
  ]);

  apiBaseInput.value = cycleConfig.apiBase || DEFAULT_API_BASE;
  subredditInput.value = Array.isArray(cycleConfig.subreddits) ? cycleConfig.subreddits.join("\n") : "daresgonewild";
  pageUrl.textContent = activeTab?.url || "Open a tab to crawl with.";
  renderState(state);

  startButton.addEventListener("click", startPageSync);
  startCycleButton.addEventListener("click", startSubredditCycle);
  stopButton.addEventListener("click", stopSync);

  apiBaseInput.addEventListener("change", saveCycleConfig);
  subredditInput.addEventListener("change", saveCycleConfig);
  subredditInput.addEventListener("blur", saveCycleConfig);

  chrome.runtime.onMessage.addListener((payload) => {
    if (payload?.type === "SYNC_STATE" && payload.tabId === activeTab?.id) {
      renderState(payload.state);
    }
  });
}

async function startPageSync() {
  const apiBase = normaliseApiBase(apiBaseInput.value);
  const tab = activeTab || (await getActiveTab());

  if (!tab?.id || !isRedditTabUrl(tab.url || "")) {
    renderState({
      ...DEFAULT_STATE,
      status: "error",
      message: "Open the Reddit page you want to crawl, then try again.",
    });
    return;
  }

  try {
    setBusyMessage("Starting page crawl...");
    await saveCycleConfig();

    const state = await sendMessage({
      type: "START_PAGE_CRAWL",
      tabId: tab.id,
      pageUrl: tab.url,
      apiBase,
    });

    renderState(state);
  } catch (error) {
    renderState({
      ...DEFAULT_STATE,
      tabId: tab.id,
      status: "error",
      message: String(error?.message || error),
    });
  }
}

async function startSubredditCycle() {
  const apiBase = normaliseApiBase(apiBaseInput.value);
  const tab = activeTab || (await getActiveTab());
  const subreddits = parseSubredditList(subredditInput.value);

  if (!tab?.id) {
    renderState({ ...DEFAULT_STATE, status: "error", message: "No active tab found." });
    return;
  }

  if (subreddits.length === 0) {
    renderState({ ...DEFAULT_STATE, status: "error", message: "Add at least one subreddit before starting the cycle." });
    return;
  }

  try {
    setBusyMessage("Starting subreddit cycle...");
    await saveCycleConfig();

    const state = await sendMessage({
      type: "START_SUBREDDIT_CYCLE",
      tabId: tab.id,
      apiBase,
      subreddits,
    });

    renderState(state);
  } catch (error) {
    renderState({
      ...DEFAULT_STATE,
      tabId: tab.id,
      status: "error",
      message: String(error?.message || error),
    });
  }
}

async function stopSync() {
  const tab = activeTab || (await getActiveTab());

  if (!tab?.id) {
    renderState({
      ...DEFAULT_STATE,
      status: "error",
      message: "No active tab found.",
    });
    return;
  }

  try {
    const state = await sendMessage({ type: "STOP_SYNC", tabId: tab.id });
    renderState(state);
  } catch (error) {
    renderState({
      ...DEFAULT_STATE,
      tabId: tab.id,
      status: "error",
      message: String(error?.message || error),
    });
  }
}

async function saveCycleConfig() {
  const apiBase = normaliseApiBase(apiBaseInput.value);
  const subreddits = parseSubredditList(subredditInput.value);

  apiBaseInput.value = apiBase;
  subredditInput.value = subreddits.join("\n");

  await sendMessage({
    type: "SAVE_SUBREDDIT_CYCLE_CONFIG",
    apiBase,
    subreddits,
  }).catch(() => {});
}

function renderState(state) {
  const next = state || DEFAULT_STATE;
  const status = next.status || "idle";
  const isRunning = status === "running";

  pages.textContent = String(next.pagesScanned || 0);
  posts.textContent = String(next.postsSynced || 0);
  urlsDone.textContent = formatUrlCount(next);
  message.textContent = next.message || "Ready.";

  startButton.disabled = isRunning;
  startCycleButton.disabled = isRunning;
  stopButton.disabled = !isRunning;

  statusDot.className = `dot ${status === "running" ? "running" : status === "error" ? "error" : ""}`;
}

function setBusyMessage(value) {
  startButton.disabled = true;
  startCycleButton.disabled = true;
  message.textContent = value;
}

function formatUrlCount(state) {
  const done = Number(state.completedUrls || 0);
  const skipped = Number(state.skippedUrls || 0);
  const total = Number(state.totalUrls || 0);

  if (!total) return String(done + skipped);
  return `${done + skipped}/${total}`;
}

function sendMessage(payload) {
  return chrome.runtime.sendMessage(payload);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function normaliseApiBase(value) {
  return (value || DEFAULT_API_BASE).replace(/\/+$/, "");
}

function isRedditTabUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)reddit\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function parseSubredditList(value) {
  const seen = new Set();
  const subreddits = [];

  for (const part of String(value || "").split(/[\n,\s]+/g)) {
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
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:www\.)?reddit\.com\/r\//i, "")
    .replace(/^\/r\//i, "")
    .replace(/^r\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/[^A-Za-z0-9_]/g, "");
}
