export {};

const statusElement = document.querySelector<HTMLElement>("#status");
const lastTaskElement = document.querySelector<HTMLElement>("#lastTask");
const forceMainQueueInput = document.querySelector<HTMLInputElement>("#forceMainQueue");
const runNowButton = document.querySelector<HTMLButtonElement>("#runNow");
const stopNowButton = document.querySelector<HTMLButtonElement>("#stopNow");
const optionsButton = document.querySelector<HTMLButtonElement>("#options");

const postsSeenElement = document.querySelector<HTMLElement>("#postsSeen");
const newPostsElement = document.querySelector<HTMLElement>("#newPosts");
const scrollPassesElement = document.querySelector<HTMLElement>("#scrollPasses");
const apiBufferedElement = document.querySelector<HTMLElement>("#apiBuffered");
const batchesSentElement = document.querySelector<HTMLElement>("#batchesSent");
const savedCountsElement = document.querySelector<HTMLElement>("#savedCounts");
const endStateElement = document.querySelector<HTMLElement>("#endState");

void refresh();
const refreshTimer = setInterval(() => void refresh(), 1000);
window.addEventListener("unload", () => clearInterval(refreshTimer));

forceMainQueueInput?.addEventListener("change", async () => {
  await chrome.storage.local.set({ forceMainQueue: forceMainQueueInput.checked });
  await refresh();
});

runNowButton?.addEventListener("click", async () => {
  if (forceMainQueueInput) {
    await chrome.storage.local.set({ forceMainQueue: forceMainQueueInput.checked });
  }

  await chrome.storage.local.set({ stopRequested: false });
  setText(statusElement, "Running…");
  const response = await chrome.runtime.sendMessage({ type: "PAIDPOLITELY_RUN_NOW" });
  const result = isRecord(response) ? response : {};

  if (result.ok === false) {
    setText(statusElement, `Error: ${String(result.error ?? "unknown")}`);
  } else {
    await refresh();
  }
});

stopNowButton?.addEventListener("click", async () => {
  setText(statusElement, "Stop requested…");
  const response = await chrome.runtime.sendMessage({ type: "PAIDPOLITELY_STOP_NOW" });
  const result = isRecord(response) ? response : {};

  if (result.ok === false) {
    setText(statusElement, `Stop error: ${String(result.error ?? "unknown")}`);
  } else {
    await refresh();
  }
});

optionsButton?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

async function refresh() {
  const stored = await chrome.storage.local.get<Record<string, unknown>>(null);
  const status = typeof stored.status === "string" ? stored.status : "ready";
  const message = typeof stored.statusMessage === "string" ? stored.statusMessage : "Ready";
  const updatedAt = typeof stored.statusUpdatedAt === "string" ? stored.statusUpdatedAt : undefined;
  const lastTask = typeof stored.lastTask === "string" ? stored.lastTask : "—";
  const stats = isRecord(stored.crawlStats) ? stored.crawlStats : {};

  if (forceMainQueueInput) {
    forceMainQueueInput.checked = stored.forceMainQueue === true;
  }

  setText(statusElement, `${status}: ${message}${updatedAt ? `\n${new Date(updatedAt).toLocaleTimeString()}` : ""}`);
  setText(lastTaskElement, lastTask);

  const postsSeen = numberValue(stats.postsSeen);
  const newPosts = numberValue(stats.newPosts);
  const scrollPasses = numberValue(stats.scrollPasses);
  const apiBuffered = numberValue(stats.apiBuffered);
  const batchesSent = numberValue(stats.batchesSent);
  const savedPosts = numberValue(stats.savedPosts);
  const completionsFound = numberValue(stats.completionsFound);
  const bottomRounds = numberValue(stats.bottomRounds);
  const noNewRounds = numberValue(stats.noNewRounds);
  const heightStableRounds = numberValue(stats.heightStableRounds);
  const endDetected = stats.endDetected === true;
  const stopRequested = stats.stopRequested === true;
  const reason = typeof stats.reason === "string" ? stats.reason : "";

  setText(postsSeenElement, String(postsSeen));
  setText(newPostsElement, String(newPosts));
  setText(scrollPassesElement, String(scrollPasses));
  setText(apiBufferedElement, String(apiBuffered));
  setText(batchesSentElement, String(batchesSent));
  setText(savedCountsElement, `${savedPosts} / ${completionsFound}`);

  setText(
    endStateElement,
    endDetected
      ? `End detected: ${reason || "lazy-load exhausted"}`
      : stopRequested
        ? "Stopping after current flush…"
        : `Still scrolling. bottom=${bottomRounds}, idle=${noNewRounds}, heightStable=${heightStableRounds}`,
  );
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function setText(element: HTMLElement | null, text: string) {
  if (element) element.textContent = text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
