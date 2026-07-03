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
};

const apiBaseInput = document.querySelector("#apiBase");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const message = document.querySelector("#message");
const pages = document.querySelector("#pages");
const posts = document.querySelector("#posts");
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

  const [{ apiBase }, state] = await Promise.all([
    chrome.storage.local.get({ apiBase: DEFAULT_API_BASE }),
    activeTab?.id
      ? sendMessage({ type: "GET_STATE", tabId: activeTab.id })
      : Promise.resolve({ ...DEFAULT_STATE, message: "Open a Reddit page to crawl it." }),
  ]);

  apiBaseInput.value = apiBase;
  pageUrl.textContent = activeTab?.url || "Open a Reddit page to crawl it.";
  renderState(state);

  startButton.addEventListener("click", startSync);
  stopButton.addEventListener("click", stopSync);

  apiBaseInput.addEventListener("change", () => {
    chrome.storage.local.set({ apiBase: normaliseApiBase(apiBaseInput.value) });
  });

  chrome.runtime.onMessage.addListener((payload) => {
    if (payload?.type === "SYNC_STATE" && payload.tabId === activeTab?.id) {
      renderState(payload.state);
    }
  });
}

async function startSync() {
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
    startButton.disabled = true;
    message.textContent = "Starting crawl...";

    await chrome.storage.local.set({ apiBase });

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

function renderState(state) {
  const next = state || DEFAULT_STATE;
  const status = next.status || "idle";

  pages.textContent = String(next.pagesScanned || 0);
  posts.textContent = String(next.postsSynced || 0);
  message.textContent = next.message || "Ready.";

  startButton.disabled = status === "running";
  stopButton.disabled = status !== "running";

  statusDot.className = `dot ${status === "running" ? "running" : status === "error" ? "error" : ""}`;
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
