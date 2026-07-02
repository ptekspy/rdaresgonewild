import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface DevtoolsTab {
  id: string;
  type?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

interface CdpResponse<T = unknown> {
  id?: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

interface RuntimeEvaluateResult {
  result?: {
    type?: string;
    value?: unknown;
    description?: string;
  };
  exceptionDetails?: unknown;
}

export type ScrollCaptureResult = {
  html: string;
  postsSeen: number;
  scrolls: number;
  exhausted: boolean;
  stoppedAtKnown: boolean;
};

type PageMetrics = {
  height: number;
  postCount: number;
  postNames: string[];
};

const DEFAULT_DEBUG_URL = "http://127.0.0.1:9222";

export class DedicatedRedditBrowser {
  private debugUrl: string;
  private readonly port: number;
  private readonly userDataDir: string;
  private process: ChildProcess | null = null;
  private socket: WebSocket | null = null;
  private requestId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor(options: { debugUrl?: string; userDataDir?: string } = {}) {
    this.debugUrl = normaliseDebugUrl(options.debugUrl ?? process.env.REDDIT_BROWSER_DEBUG_URL ?? DEFAULT_DEBUG_URL);
    this.port = Number(new URL(this.debugUrl).port || "9222");
    this.userDataDir =
      options.userDataDir ??
      process.env.CRAWLER_BROWSER_USER_DATA_DIR ??
      path.join(os.homedir(), ".cache", "rdgw-crawler-browser");
  }

  async start(startUrl = "https://www.reddit.com/r/daresgonewild/new/") {
    if (!(await isDebugEndpointReady(this.debugUrl))) {
      await this.launch(startUrl);
    }

    this.debugUrl = await waitForReachableDebugEndpoint(this.debugUrl);
    await this.openPage("about:blank");
    await this.enablePage();
  }

  async setRedditCookies(cookieHeader: string) {
    const cookies = parseCookieHeader(cookieHeader);
    if (cookies.length === 0) {
      throw new Error("REDDIT_COOKIE is required for the browser bot");
    }

    await this.send("Network.enable", {});
    for (const cookie of cookies) {
      await this.send("Network.setCookie", {
        name: cookie.name,
        value: cookie.value,
        url: "https://www.reddit.com",
        domain: ".reddit.com",
        path: "/",
        secure: true,
      });
    }
  }

  async navigate(url: string) {
    await this.send("Page.navigate", { url });
    await this.waitForReadyState();
  }

  async scrollAndCapture(options: {
    waitMs: number;
    stableRounds: number;
    maxScrolls: number;
    shouldStop?: (postNames: string[]) => Promise<boolean>;
  }): Promise<ScrollCaptureResult> {
    let scrolls = 0;
    let stableRounds = 0;
    let lastHeight = 0;
    let lastPostCount = 0;
    let stoppedAtKnown = false;
    let latestMetrics: PageMetrics = { height: 0, postCount: 0, postNames: [] };

    while (scrolls < options.maxScrolls && stableRounds < options.stableRounds) {
      await this.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
      await sleep(options.waitMs);
      latestMetrics = await this.getPageMetrics();
      scrolls++;

      if (options.shouldStop && (await options.shouldStop(latestMetrics.postNames))) {
        stoppedAtKnown = true;
        break;
      }

      if (latestMetrics.height === lastHeight && latestMetrics.postCount === lastPostCount) {
        stableRounds++;
      } else {
        stableRounds = 0;
      }

      lastHeight = latestMetrics.height;
      lastPostCount = latestMetrics.postCount;
    }

    const html = await this.evaluate<string>("document.documentElement.outerHTML");

    return {
      html,
      postsSeen: latestMetrics.postCount,
      scrolls,
      exhausted: stableRounds >= options.stableRounds,
      stoppedAtKnown,
    };
  }

  async close() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private async launch(startUrl: string) {
    fs.mkdirSync(this.userDataDir, { recursive: true });

    const executable = process.env.CRAWLER_BROWSER_EXECUTABLE ?? findLinuxBrowser();
    if (executable) {
      this.process = spawn(
        executable,
        [
          `--remote-debugging-port=${this.port}`,
          `--user-data-dir=${this.userDataDir}`,
          "--no-first-run",
          "--disable-default-apps",
          startUrl,
        ],
        { detached: true, stdio: "ignore" },
      );
      this.process.unref();
      return;
    }

    launchWindowsBrowser(this.port, startUrl);
  }

  private async openPage(url: string) {
    const encodedUrl = encodeURIComponent(url);
    let response = await fetch(`${this.debugUrl}/json/new?${encodedUrl}`, { method: "PUT" });
    if (!response.ok) {
      response = await fetch(`${this.debugUrl}/json/new?${encodedUrl}`);
    }

    if (!response.ok) {
      throw new Error(`Could not create browser tab: ${response.status} ${await response.text()}`);
    }

    const tab = (await response.json()) as DevtoolsTab;
    if (!tab.webSocketDebuggerUrl) {
      throw new Error(`Created tab has no websocket URL: ${JSON.stringify(tab)}`);
    }

    await this.connect(rewriteDebuggerWebSocketUrl(tab.webSocketDebuggerUrl, this.debugUrl));
  }

  private async enablePage() {
    await this.send("Runtime.enable", {});
    await this.send("Page.enable", {});
    await this.send("Network.enable", {});
  }

  private async connect(webSocketDebuggerUrl: string) {
    this.socket = await openWebSocket(webSocketDebuggerUrl);

    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpResponse;
      if (!message.id) return;

      const pending = this.pending.get(message.id);
      if (!pending) return;

      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(`${message.error.message}${message.error.data ? ` ${JSON.stringify(message.error.data)}` : ""}`));
        return;
      }

      pending.resolve(message.result);
    });

    this.socket.addEventListener("close", () => {
      this.socket = null;
    });
  }

  private async waitForReadyState() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 60_000) {
      const state = await this.evaluate<string>("document.readyState");
      if (state === "interactive" || state === "complete") return;
      await sleep(500);
    }
  }

  private async getPageMetrics() {
    return this.evaluate<PageMetrics>(`
      (() => {
        const posts = [...document.querySelectorAll("shreddit-post")];
        return {
          height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
          postCount: posts.length,
          postNames: posts.map((post) => post.getAttribute("id")).filter(Boolean)
        };
      })()
    `);
  }

  private async evaluate<T = unknown>(expression: string): Promise<T> {
    const response = await this.send<RuntimeEvaluateResult>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: 120_000,
    });

    if (response.exceptionDetails) {
      throw new Error(`Browser evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
    }

    return response.result?.value as T;
  }

  private async send<T>(method: string, params: Record<string, unknown>) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Browser websocket is not connected");
    }

    const id = this.requestId++;
    const responsePromise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });

      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP request timed out: ${method}`));
      }, 130_000);
    });

    socket.send(JSON.stringify({ id, method, params }));
    return responsePromise;
  }
}

export function parseCookieHeader(cookieHeader: string) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const equalsIndex = part.indexOf("=");
      if (equalsIndex === -1) return null;
      return {
        name: part.slice(0, equalsIndex).trim(),
        value: part.slice(equalsIndex + 1).trim(),
      };
    })
    .filter((cookie): cookie is { name: string; value: string } => Boolean(cookie?.name));
}

function findLinuxBrowser() {
  for (const executable of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) {
    try {
      const resolved = execFileSync("which", [executable], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (resolved) return resolved;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function launchWindowsBrowser(port: number, startUrl: string) {
  const script = `
    Get-CimInstance Win32_Process |
      Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*rdgw-crawler-browser*' } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500

    $candidates = @()
    foreach ($root in @($env:ProgramFiles, $env:LOCALAPPDATA, [Environment]::GetEnvironmentVariable('ProgramFiles(x86)'))) {
      if (-not $root) { continue }
      $candidates += Join-Path $root 'Google\\Chrome\\Application\\chrome.exe'
      $candidates += Join-Path $root 'Microsoft\\Edge\\Application\\msedge.exe'
    }
    $browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $browser) { throw 'Could not find Chrome or Edge' }
    $profile = Join-Path $env:LOCALAPPDATA 'rdgw-crawler-browser'
    New-Item -ItemType Directory -Force -Path $profile | Out-Null
    Start-Process -FilePath $browser -ArgumentList @(
      '--remote-debugging-port=${port}',
      '--remote-debugging-address=0.0.0.0',
      "--user-data-dir=$profile",
      '--no-first-run',
      '--disable-default-apps',
      '${startUrl.replace(/'/g, "''")}'
    )
  `;

  execFileSync(getPowerShellExecutable(), ["-NoProfile", "-Command", script], { stdio: "ignore" });
}

function getPowerShellExecutable() {
  for (const executable of [
    "powershell.exe",
    "/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe",
    "/mnt/c/WINDOWS/system32/WindowsPowerShell/v1.0/powershell.exe",
  ]) {
    try {
      execFileSync(executable, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
        stdio: "ignore",
      });
      return executable;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("Could not find powershell.exe for launching the Windows browser");
}

async function isDebugEndpointReady(debugUrl: string) {
  try {
    const response = await fetch(`${debugUrl}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForDebugEndpoint(debugUrl: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (await isDebugEndpointReady(debugUrl)) return;
    await sleep(1_000);
  }
  throw new Error(`Browser DevTools did not become ready at ${debugUrl}`);
}

async function waitForReachableDebugEndpoint(preferredDebugUrl: string) {
  const startedAt = Date.now();
  const candidates = getDebugUrlCandidates(preferredDebugUrl);

  while (Date.now() - startedAt < 60_000) {
    for (const candidate of candidates) {
      if (await isDebugEndpointReady(candidate)) return candidate;
    }
    await sleep(1_000);
  }

  throw new Error(`Browser DevTools did not become ready at any reachable URL: ${candidates.join(", ")}`);
}

function getDebugUrlCandidates(preferredDebugUrl: string) {
  const candidates = [preferredDebugUrl];
  const preferred = new URL(preferredDebugUrl);

  if (isLocalDebugHost(preferred.hostname) && isWsl()) {
    for (const host of getWslWindowsHostCandidates()) {
      const url = new URL(preferredDebugUrl);
      url.hostname = host;
      candidates.push(normaliseDebugUrl(url.toString()));
    }
  }

  return [...new Set(candidates.map(normaliseDebugUrl))];
}

function rewriteDebuggerWebSocketUrl(webSocketDebuggerUrl: string, debugUrl: string) {
  const websocket = new URL(webSocketDebuggerUrl);
  const debug = new URL(debugUrl);
  websocket.hostname = debug.hostname;
  websocket.port = debug.port;
  return websocket.toString();
}

function isLocalDebugHost(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function isWsl() {
  try {
    return fs.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

function getWslWindowsHostCandidates() {
  const candidates: string[] = [];

  try {
    const resolvConf = fs.readFileSync("/etc/resolv.conf", "utf8");
    const match = resolvConf.match(/^nameserver\s+(\S+)/m);
    if (match?.[1]) candidates.push(match[1]);
  } catch {
    // Ignore and try the route table below.
  }

  try {
    const routeTable = fs.readFileSync("/proc/net/route", "utf8");
    for (const line of routeTable.split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/);
      if (fields[1] !== "00000000" || !fields[2]) continue;
      const gateway = littleEndianHexIpToString(fields[2]);
      if (gateway) candidates.push(gateway);
      break;
    }
  } catch {
    // No route table available.
  }

  return [...new Set(candidates.filter(Boolean))];
}

function littleEndianHexIpToString(value: string) {
  if (!/^[0-9a-fA-F]{8}$/.test(value)) return null;

  const bytes = value.match(/../g);
  if (!bytes) return null;

  return bytes
    .reverse()
    .map((byte) => Number.parseInt(byte, 16))
    .join(".");
}

function normaliseDebugUrl(value: string) {
  return value.replace(/\/$/, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openWebSocket(url: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url);

    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error(`Could not connect to DevTools websocket: ${url}`)),
      { once: true },
    );
  });
}
