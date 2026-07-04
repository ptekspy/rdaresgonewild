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

const writerBaseInput = document.querySelector("#writerBase");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const message = document.querySelector("#message");
const scrolls = document.querySelector("#scrolls");
const parsed = document.querySelector("#parsed");
const saved = document.querySelector("#saved");
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

  const [config, state] = await Promise.all([
    sendMessage({ type: "GET_CONFIG" }).catch(() => ({ writerBase: DEFAULT_WRITER_BASE })),
    activeTab?.id
      ? sendMessage({ type: "GET_STATE", tabId: activeTab.id })
      : Promise.resolve({ ...DEFAULT_STATE, message: "Open a tab before crawling." }),
  ]);

  writerBaseInput.value = config.writerBase || DEFAULT_WRITER_BASE;
  pageUrl.textContent = activeTab?.url || "Open a tab to crawl with.";
  renderState(state);

  startButton.addEventListener("click", startPageCrawl);
  stopButton.addEventListener("click", stopPageCrawl);
  writerBaseInput.addEventListener("change", saveConfig);
  writerBaseInput.addEventListener("blur", saveConfig);

  chrome.runtime.onMessage.addListener((payload) => {
    if (payload?.type === "CRAWL_STATE" && payload.tabId === activeTab?.id) {
      renderState(payload.state);
    }
  });
}

async function startPageCrawl() {
  const writerBase = normaliseWriterBase(writerBaseInput.value);
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
    setBusyMessage("Checking local DB writer...");
    await saveConfig();

    const state = await sendMessage({
      type: "START_PAGE_CRAWL",
      tabId: tab.id,
      pageUrl: tab.url,
      writerBase,
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

async function stopPageCrawl() {
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
    const state = await sendMessage({ type: "STOP_PAGE_CRAWL", tabId: tab.id });
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

async function saveConfig() {
  const writerBase = normaliseWriterBase(writerBaseInput.value);
  writerBaseInput.value = writerBase;
  await sendMessage({ type: "SAVE_CONFIG", writerBase }).catch(() => {});
}

function renderState(state) {
  const next = state || DEFAULT_STATE;
  const status = next.status || "idle";
  const isRunning = status === "running";

  scrolls.textContent = String(next.scrolls || 0);
  parsed.textContent = String(next.postsParsed || 0);
  saved.textContent = String(next.postsSaved || 0);
  message.textContent = next.message || "Ready.";

  startButton.disabled = isRunning;
  stopButton.disabled = !isRunning;

  statusDot.className = `dot ${status === "running" ? "running" : status === "error" ? "error" : ""}`;
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

function normaliseWriterBase(value) {
  return (value || DEFAULT_WRITER_BASE).replace(/\/+$/, "");
}

function isRedditTabUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)reddit\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}
