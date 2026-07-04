const DEFAULT_API_BASE = "https://api.paidpolitely.com";

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

const apiBaseInput = document.querySelector("#apiBase");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const message = document.querySelector("#message");
const scrolls = document.querySelector("#scrolls");
const links = document.querySelector("#links");
const fetched = document.querySelector("#fetched");
const saved = document.querySelector("#saved");
const statusDot = document.querySelector("#statusDot");
const pageUrl = document.querySelector("#pageUrl");

let activeTab = null;

init().catch((error) => {
  renderState({ ...DEFAULT_STATE, status: "error", message: String(error?.message || error) });
});

async function init() {
  activeTab = await getActiveTab();

  const [config, state] = await Promise.all([
    sendMessage({ type: "GET_CONFIG" }).catch(() => ({ apiBase: DEFAULT_API_BASE })),
    activeTab?.id ? sendMessage({ type: "GET_STATE", tabId: activeTab.id }) : Promise.resolve(DEFAULT_STATE),
  ]);

  apiBaseInput.value = config.apiBase || DEFAULT_API_BASE;
  pageUrl.textContent = activeTab?.url || "Open a Reddit tab to crawl.";
  renderState(state);

  startButton.addEventListener("click", startCrawl);
  stopButton.addEventListener("click", stopCrawl);
  apiBaseInput.addEventListener("change", saveConfig);
  apiBaseInput.addEventListener("blur", saveConfig);

  chrome.runtime.onMessage.addListener((payload) => {
    if (payload?.type === "CRAWL_STATE" && payload.tabId === activeTab?.id) {
      renderState(payload.state);
    }
  });
}

async function startCrawl() {
  const tab = activeTab || (await getActiveTab());
  const apiBase = normaliseApiBase(apiBaseInput.value);

  if (!tab?.id || !isRedditUrl(tab.url || "")) {
    renderState({ ...DEFAULT_STATE, status: "error", message: "Open the Reddit page you want to crawl, then try again." });
    return;
  }

  try {
    setBusyMessage("Starting crawl...");
    await saveConfig();

    const state = await sendMessage({
      type: "START_CRAWL",
      tabId: tab.id,
      pageUrl: tab.url,
      apiBase,
    });

    renderState(state);
  } catch (error) {
    renderState({ ...DEFAULT_STATE, tabId: tab.id, status: "error", message: String(error?.message || error) });
  }
}

async function stopCrawl() {
  const tab = activeTab || (await getActiveTab());

  if (!tab?.id) {
    renderState({ ...DEFAULT_STATE, status: "error", message: "No active tab found." });
    return;
  }

  try {
    const state = await sendMessage({ type: "STOP_CRAWL", tabId: tab.id });
    renderState(state);
  } catch (error) {
    renderState({ ...DEFAULT_STATE, tabId: tab.id, status: "error", message: String(error?.message || error) });
  }
}

async function saveConfig() {
  const apiBase = normaliseApiBase(apiBaseInput.value);
  apiBaseInput.value = apiBase;
  await sendMessage({ type: "SAVE_CONFIG", apiBase }).catch(() => undefined);
}

function renderState(state) {
  const next = state || DEFAULT_STATE;
  const status = next.status || "idle";
  const isRunning = status === "running";

  scrolls.textContent = String(next.scrolls || 0);
  links.textContent = String(next.linksSeen || 0);
  fetched.textContent = String(next.postsFetched || 0);
  saved.textContent = String(next.postsSynced || 0);

  const skipped = Number(next.postsSkipped || 0);
  message.textContent = skipped ? `${next.message || "Ready."} Skipped ${skipped}.` : next.message || "Ready.";

  startButton.disabled = isRunning;
  stopButton.disabled = !isRunning;
  statusDot.className = `dot ${status === "running" ? "running" : status === "error" ? "error" : status === "completed" ? "completed" : ""}`;
}

function setBusyMessage(value) {
  startButton.disabled = true;
  message.textContent = value;
}

function sendMessage(payload) {
  return chrome.runtime.sendMessage(payload);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
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
