import type { RedditListingClient, RedditPost, RawRedditPost } from "./reddit.js";
import { normalisePost } from "./reddit.js";
import { RateLimiter } from "./rate-limiter.js";

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

interface BrowserListing {
  data: {
    children: Array<{ data: RawRedditPost }>;
    after: string | null;
  };
}

const DEFAULT_DEBUG_URL = "http://127.0.0.1:9222";
const DEFAULT_SUBREDDIT = "daresgonewild";

export class BrowserRedditClient implements RedditListingClient {
  private readonly debugUrl: string;
  private readonly tabMatch: string;
  private readonly subreddit: string;
  private readonly limiter: RateLimiter;

  private socket: WebSocket | null = null;
  private requestId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor(options: { debugUrl?: string; tabMatch?: string; subreddit?: string; maxRpm?: number } = {}) {
    this.debugUrl = normaliseDebugUrl(options.debugUrl ?? process.env.REDDIT_BROWSER_DEBUG_URL ?? DEFAULT_DEBUG_URL);
    this.tabMatch = options.tabMatch ?? process.env.REDDIT_BROWSER_TAB_MATCH ?? "reddit.com";
    this.subreddit = options.subreddit ?? process.env.REDDIT_SUBREDDIT ?? DEFAULT_SUBREDDIT;
    this.limiter = new RateLimiter(options.maxRpm ?? 25);
  }

  static fromEnv(maxRpm = 25) {
    return new BrowserRedditClient({
      debugUrl: process.env.REDDIT_BROWSER_DEBUG_URL,
      tabMatch: process.env.REDDIT_BROWSER_TAB_MATCH,
      subreddit: process.env.REDDIT_SUBREDDIT,
      maxRpm,
    });
  }

  get targetSubreddit() {
    return this.subreddit;
  }

  async fetchSubredditNew(after?: string): Promise<{ posts: RedditPost[]; after: string | null }> {
    const params = { limit: "100", raw_json: "1", after: after ?? "" };
    const listing = await this.browserFetchJson<BrowserListing>(
      `/r/${encodeURIComponent(this.subreddit)}/new.json?${toSearchParams(params)}`
    );

    return {
      posts: listing.data.children
        .map((child) => normalisePost(child.data))
        .filter((post): post is RedditPost => Boolean(post)),
      after: listing.data.after,
    };
  }

  async fetchUserSubmitted(
    username: string,
    after?: string
  ): Promise<{ posts: RedditPost[]; after: string | null }> {
    const params = { limit: "100", raw_json: "1", after: after ?? "" };
    const listing = await this.browserFetchJson<BrowserListing>(
      `/user/${encodeURIComponent(username)}/submitted.json?${toSearchParams(params)}`
    );

    return {
      posts: listing.data.children
        .map((child) => normalisePost(child.data))
        .filter((post): post is RedditPost => {
          if (!post) return false;
          return post.permalink.toLowerCase().includes(`/r/${this.subreddit.toLowerCase()}/`);
        }),
      after: listing.data.after,
    };
  }

  async close() {
    if (!this.socket) return;
    this.socket.close();
    this.socket = null;
  }

  private async browserFetchJson<T>(redditPath: string): Promise<T> {
    await this.limiter.throttle();

    const expression = `
      (async () => {
        const response = await fetch(${JSON.stringify(`https://www.reddit.com${redditPath}`)}, {
          credentials: "include",
          headers: { "accept": "application/json" }
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error("Reddit browser fetch failed " + response.status + ": " + text.slice(0, 500));
        }
        return JSON.parse(text);
      })()
    `;

    const value = await this.evaluate(expression);
    this.limiter.onSuccess();
    return value as T;
  }

  private async evaluate(expression: string) {
    const response = await this.send<RuntimeEvaluateResult>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: 60_000,
    });

    if (response.exceptionDetails) {
      throw new Error(`Browser evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
    }

    return response.result?.value;
  }

  private async send<T>(method: string, params: Record<string, unknown>) {
    const socket = await this.getSocket();
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
      }, 65_000);
    });

    socket.send(JSON.stringify({ id, method, params }));
    return responsePromise;
  }

  private async getSocket() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return this.socket;
    }

    const tab = await this.findRedditTab();
    if (!tab.webSocketDebuggerUrl) {
      throw new Error(`Selected tab has no webSocketDebuggerUrl: ${tab.title ?? tab.url ?? tab.id}`);
    }

    this.socket = await openWebSocket(tab.webSocketDebuggerUrl);

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

    await this.send("Runtime.enable", {});
    return this.socket;
  }

  private async findRedditTab() {
    const response = await fetch(`${this.debugUrl}/json/list`);
    if (!response.ok) {
      throw new Error(
        `Could not reach Chrome/Edge DevTools at ${this.debugUrl}. Start your browser with --remote-debugging-port=9222.`
      );
    }

    const tabs = (await response.json()) as DevtoolsTab[];
    const match = this.tabMatch.toLowerCase();

    const tab = tabs.find((candidate) => {
      if (candidate.type !== "page") return false;
      const url = (candidate.url ?? "").toLowerCase();
      const title = (candidate.title ?? "").toLowerCase();
      return url.includes(match) || title.includes(match);
    });

    if (!tab) {
      const visibleTabs = tabs
        .filter((candidate) => candidate.type === "page")
        .map((candidate, index) => `${index + 1}. ${candidate.title ?? "(untitled)"} — ${candidate.url ?? "(no url)"}`)
        .join("\n");

      throw new Error(
        `No browser tab matched "${this.tabMatch}". Open https://www.reddit.com/r/${this.subreddit}/new/ in the debug browser.\n\nVisible tabs:\n${visibleTabs}`
      );
    }

    return tab;
  }
}

function normaliseDebugUrl(value: string) {
  return value.replace(/\/$/, "");
}

function toSearchParams(values: Record<string, string>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    params.set(key, value);
  }

  return params.toString();
}

function openWebSocket(url: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url);

    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error(`Could not connect to DevTools websocket: ${url}`)),
      { once: true }
    );
  });
}
