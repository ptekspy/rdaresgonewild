const DEFAULT_API_BASE = "https://api.paidpolitely.com";

const apiBaseInput = document.querySelector("#apiBase");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const message = document.querySelector("#message");
const pages = document.querySelector("#pages");
const posts = document.querySelector("#posts");
const statusDot = document.querySelector("#statusDot");
const pageUrl = document.querySelector("#pageUrl");

let activeTab = null;

init();

async function init() {
  activeTab = await getActiveTab();

  const [{ apiBase }, state] = await Promise.all([
    chrome.storage.local.get({ apiBase: DEFAULT_API_BASE }),
    activeTab?.id ? sendMessage({ type: "GET_STATE", tabId: activeTab.id }) : DEFAULT_STATE,
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
    message.textContent = "Open the Reddit page you want to crawl, then try again.";
    return;
  }

  await chrome.storage.local.set({ apiBase });
  const state = await sendMessage({
    type: "START_PAGE_CRAWL",
    tabId: tab.id,
    pageUrl: tab.url,
    apiBase,
  });
  renderState(state);
}

async function stopSync() {
  const tab = activeTab || (await getActiveTab());

  if (!tab?.id) {
    message.textContent = "No active tab found.";
    return;
  }

  const state = await sendMessage({ type: "STOP_SYNC", tabId: tab.id });
  renderState(state);
}

function renderState(state) {
  const status = state?.status || "idle";
  pages.textContent = String(state?.pagesScanned || 0);
  posts.textContent = String(state?.postsSynced || 0);
  message.textContent = state?.message || "Ready.";
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
