export {};

type CrawlMode = "system" | "backfill" | "current";

const statusElement = document.querySelector<HTMLElement>("#status");
const optionsButton = document.querySelector<HTMLButtonElement>("#options");
const stopAllButton = document.querySelector<HTMLButtonElement>("#stopAll");
const modes: CrawlMode[] = ["system", "backfill", "current"];

for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-start]"))) {
  button.addEventListener("click", async () => {
    const mode = button.dataset.start as CrawlMode;
    setText(statusElement, `Starting ${mode}…`);
    const response = await chrome.runtime.sendMessage({ type: "PAIDPOLITELY_START_MODE", mode });
    const result = isRecord(response) ? response : {};
    if (result.ok === false) setText(statusElement, `Error: ${String(result.error ?? "unknown")}`);
    await refresh();
  });
}

for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-stop]"))) {
  button.addEventListener("click", async () => {
    const mode = button.dataset.stop as CrawlMode;
    setText(statusElement, `Stopping ${mode}…`);
    const response = await chrome.runtime.sendMessage({ type: "PAIDPOLITELY_STOP_MODE", mode });
    const result = isRecord(response) ? response : {};
    if (result.ok === false) setText(statusElement, `Stop error: ${String(result.error ?? "unknown")}`);
    await refresh();
  });
}

stopAllButton?.addEventListener("click", async () => {
  setText(statusElement, "Stopping all modes…");
  const response = await chrome.runtime.sendMessage({ type: "PAIDPOLITELY_STOP_ALL" });
  const result = isRecord(response) ? response : {};
  if (result.ok === false) setText(statusElement, `Stop error: ${String(result.error ?? "unknown")}`);
  await refresh();
});

optionsButton?.addEventListener("click", () => chrome.runtime.openOptionsPage());

void refresh();
const timer = setInterval(() => void refresh(), 1000);
window.addEventListener("unload", () => clearInterval(timer));

async function refresh() {
  const stored = await chrome.storage.local.get<Record<string, unknown>>(null);
  const status = typeof stored.status === "string" ? stored.status : "ready";
  const message = typeof stored.statusMessage === "string" ? stored.statusMessage : "Ready";
  const updatedAt = typeof stored.statusUpdatedAt === "string" ? stored.statusUpdatedAt : undefined;
  setText(statusElement, `${status}: ${message}${updatedAt ? `\n${new Date(updatedAt).toLocaleTimeString()}` : ""}`);

  for (const mode of modes) {
    const rawStats = stored[`crawlStats_${mode}`];
    renderMode(mode, isRecord(rawStats) ? rawStats : {});
  }
}

function renderMode(mode: CrawlMode, stats: Record<string, unknown>) {
  const el = document.querySelector<HTMLElement>(`#stats-${mode}`);
  if (!el) return;
  const status = typeof stats.status === "string" ? stats.status : "idle";
  const target = typeof stats.taskTarget === "string" ? stats.taskTarget : "—";
  const reason = typeof stats.reason === "string" ? stats.reason : "";
  const endDetected = stats.endDetected === true;
  const stopRequested = stats.stopRequested === true;

  const items: Array<[string, string]> = [
    ["Status", status],
    ["Target", target],
    ["Posts seen", String(numberValue(stats.postsSeen))],
    ["New last pass", String(numberValue(stats.newPosts))],
    ["Scroll passes", String(numberValue(stats.scrollPasses))],
    ["API buffered", String(numberValue(stats.apiBuffered))],
    ["Batches", String(numberValue(stats.batchesSent))],
    ["Saved / completions", `${numberValue(stats.savedPosts)} / ${numberValue(stats.completionsFound)}`],
    ["End", endDetected ? "yes" : stopRequested ? "stopping" : "no"],
    ["Reason", reason || "—"],
  ];

  el.innerHTML = items.map(([label, value]) => `<span class="label">${escapeHtml(label)}</span><span>${escapeHtml(value)}</span>`).join("");
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function setText(element: HTMLElement | null, text: string) {
  if (element) element.textContent = text;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
