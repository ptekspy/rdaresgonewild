import { RateLimiter } from "./rate-limiter.js";

export interface RedditPost {
  id: string;          // without t3_ prefix
  name: string;        // full name e.g. t3_abc123
  title: string;
  selftext: string;
  author: string;
  link_flair_text: string | null;
  score: number;
  upvote_ratio: number | null;
  num_comments: number;
  permalink: string;
  created_utc: number;
}

export interface RedditListingPage {
  posts: RedditPost[];
  after: string | null;

  /**
   * Number of raw Reddit listing children returned before any normalisation/filtering.
   * Useful for distinguishing "Reddit has no more posts" from
   * "this page had no posts matching our target subreddit".
   */
  rawCount: number;

  /**
   * Number of usable posts after normalisation and subreddit filtering.
   */
  matchedCount: number;
}

export interface RedditListingClient {
  readonly targetSubreddit: string;
  fetchSubredditNew(after?: string): Promise<RedditListingPage>;
  fetchUserSubmitted(username: string, after?: string): Promise<RedditListingPage>;
}

interface RedditListing {
  data: {
    children: Array<{ data: RawRedditPost }>;
    after: string | null;
    before: string | null;
  };
}

export interface RawRedditPost {
  id?: string;
  name?: string;
  title?: string;
  selftext?: string;
  author?: string;
  link_flair_text?: string | null;
  score?: number;
  upvote_ratio?: number | null;
  num_comments?: number;
  permalink?: string;
  created_utc?: number;
  subreddit?: string;
}

const DEFAULT_SUBREDDIT = "daresgonewild";

export class RedditClient implements RedditListingClient {
  private readonly limiter: RateLimiter;
  private readonly cookie: string;
  private readonly userAgent: string;
  private readonly subreddit: string;

  constructor(cookie: string, maxRpm = 25, subreddit = DEFAULT_SUBREDDIT) {
    if (!cookie) throw new Error("REDDIT_COOKIE is required for the cookie crawler");
    this.cookie = cookie;
    this.subreddit = subreddit;
    this.limiter = new RateLimiter(maxRpm);
    this.userAgent =
      process.env.REDDIT_USER_AGENT ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
  }

  static fromEnv(maxRpm = 25) {
    return new RedditClient(
      process.env.REDDIT_COOKIE ?? "",
      maxRpm,
      process.env.REDDIT_SUBREDDIT ?? DEFAULT_SUBREDDIT
    );
  }

  get targetSubreddit() {
    return this.subreddit;
  }

  private async request<T>(url: string): Promise<T> {
    let attempts = 0;

    while (attempts < 5) {
      await this.limiter.throttle();
      attempts++;

      const res = await fetch(url, {
        headers: {
          Cookie: this.cookie,
          "User-Agent": this.userAgent,
          Accept: "application/json",
        },
      });

      if (res.status === 429) {
        await this.limiter.onRateLimit(res.headers.get("retry-after") ?? undefined);
        continue;
      }

      if (res.status >= 500) {
        await this.limiter.onServerError();
        continue;
      }

      if (!res.ok) {
        throw new Error(`Reddit responded ${res.status} for ${url}: ${await res.text()}`);
      }

      this.limiter.onSuccess();
      return res.json() as Promise<T>;
    }

    throw new Error(`Gave up after ${attempts} attempts for ${url}`);
  }

  async fetchSubredditNew(after?: string): Promise<RedditListingPage> {
    const params = new URLSearchParams({ limit: "100", raw_json: "1" });
    if (after) params.set("after", after);

    const listing = await this.request<RedditListing>(
      `https://www.reddit.com/r/${encodeURIComponent(this.subreddit)}/new.json?${params}`
    );

    const rawChildren = listing.data.children;
    const posts = rawChildren
      .map((child) => normalisePost(child.data))
      .filter((post): post is RedditPost => Boolean(post));

    return {
      posts,
      after: listing.data.after,
      rawCount: rawChildren.length,
      matchedCount: posts.length,
    };
  }

  async fetchUserSubmitted(username: string, after?: string): Promise<RedditListingPage> {
    const params = new URLSearchParams({ limit: "100", raw_json: "1" });
    if (after) params.set("after", after);

    const listing = await this.request<RedditListing>(
      `https://www.reddit.com/user/${encodeURIComponent(username)}/submitted.json?${params}`
    );

    const rawChildren = listing.data.children;
    const normalisedPosts = rawChildren
      .map((child) => normalisePost(child.data))
      .filter((post): post is RedditPost => Boolean(post));

    const posts = normalisedPosts.filter((post) =>
      post.permalink.toLowerCase().includes(`/r/${this.subreddit.toLowerCase()}/`)
    );

    return {
      posts,
      after: listing.data.after,
      rawCount: rawChildren.length,
      matchedCount: posts.length,
    };
  }
}

export function normalisePost(raw: RawRedditPost): RedditPost | null {
  if (!raw.id || !raw.name || !raw.title || !raw.author || !raw.created_utc) return null;
  if (raw.author === "[deleted]") return null;

  return {
    id: raw.id,
    name: raw.name,
    title: raw.title,
    selftext: raw.selftext ?? "",
    author: raw.author,
    link_flair_text: raw.link_flair_text ?? null,
    score: raw.score ?? 0,
    upvote_ratio: raw.upvote_ratio ?? null,
    num_comments: raw.num_comments ?? 0,
    permalink: normalisePermalink(raw.permalink ?? `/comments/${raw.id}`),
    created_utc: raw.created_utc,
  };
}

function normalisePermalink(permalink: string) {
  if (permalink.startsWith("http://") || permalink.startsWith("https://")) {
    return permalink;
  }

  return `https://www.reddit.com${permalink.startsWith("/") ? permalink : `/${permalink}`}`;
}