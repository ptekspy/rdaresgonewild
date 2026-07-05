export {};

const statusElement = document.querySelector<HTMLElement>("#status");
const lastTaskElement = document.querySelector<HTMLElement>("#lastTask");
const forceMainQueueInput = document.querySelector<HTMLInputElement>("#forceMainQueue");
const runNowButton = document.querySelector<HTMLButtonElement>("#runNow");
const optionsButton = document.querySelector<HTMLButtonElement>("#options");

void refresh();

forceMainQueueInput?.addEventListener("change", async () => {
  await chrome.storage.local.set({ forceMainQueue: forceMainQueueInput.checked });
  await refresh();
});

runNowButton?.addEventListener("click", async () => {
  if (forceMainQueueInput) {
    await chrome.storage.local.set({ forceMainQueue: forceMainQueueInput.checked });
  }

  setText(statusElement, "Running…");
  const response = await chrome.runtime.sendMessage({ type: "PAIDPOLITELY_RUN_NOW" });
  const result = isRecord(response) ? response : {};

  if (result.ok === false) {
    setText(statusElement, `Error: ${String(result.error ?? "unknown")}`);
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

  if (forceMainQueueInput) {
    forceMainQueueInput.checked = stored.forceMainQueue === true;
  }

  setText(statusElement, `${status}: ${message}${updatedAt ? ` (${new Date(updatedAt).toLocaleTimeString()})` : ""}`);
  setText(lastTaskElement, lastTask);
}

function setText(element: HTMLElement | null, text: string) {
  if (element) element.textContent = text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
