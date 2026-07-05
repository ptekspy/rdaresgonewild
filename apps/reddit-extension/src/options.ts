export {};
const DEFAULT_API_BASE_URL = "http://localhost:8787";
const DEFAULT_POLL_SECONDS = 30;

const apiBaseUrlInput = document.querySelector<HTMLInputElement>("#apiBaseUrl");
const pollSecondsInput = document.querySelector<HTMLInputElement>("#pollSeconds");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const statusElement = document.querySelector<HTMLElement>("#status");

void loadOptions();

saveButton?.addEventListener("click", () => {
  void saveOptions();
});

async function loadOptions() {
  const stored = await chrome.storage.local.get<Record<string, unknown>>(null);

  if (apiBaseUrlInput) {
    apiBaseUrlInput.value = typeof stored.apiBaseUrl === "string" ? stored.apiBaseUrl : DEFAULT_API_BASE_URL;
  }

  if (pollSecondsInput) {
    pollSecondsInput.value = String(typeof stored.pollSeconds === "number" ? stored.pollSeconds : DEFAULT_POLL_SECONDS);
  }
}

async function saveOptions() {
  const apiBaseUrl = (apiBaseUrlInput?.value ?? DEFAULT_API_BASE_URL).trim().replace(/\/$/, "");
  const pollSeconds = Number.parseInt(pollSecondsInput?.value ?? String(DEFAULT_POLL_SECONDS), 10);

  if (!/^https?:\/\//i.test(apiBaseUrl)) {
    setStatus("API base URL must start with http:// or https://");
    return;
  }

  await chrome.storage.local.set({
    apiBaseUrl,
    pollSeconds: Number.isFinite(pollSeconds) ? Math.max(10, pollSeconds) : DEFAULT_POLL_SECONDS,
  });

  setStatus("Saved. The worker will use this on its next run.");
}

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message;
}
