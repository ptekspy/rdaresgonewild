import { RateLimiter } from "./rate-limiter.js";

export interface RedditPost {
  id: string;          // without t3_ prefix
  name: string;        // full name e.g. t3_abc123
  title: string;
  selftext: string;
  author: string;
  link_flair_text: string | null;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  permalink: string;
  created_utc: number;
}

interface RedditListing {
  data: {
    children: Array<{ data: RedditPost }>;
    after: string | null;
    before: string | null;
  };
}

export class RedditClient {
  private readonly limiter: RateLimiter;
  private readonly cookie: string;
  private readonly userAgent: string;

  constructor(cookie: string, maxRpm = 25) {
    if (!cookie) throw new Error("REDDIT_COOKIE is required for the crawler");
    this.cookie = cookie;
    this.limiter = new RateLimiter(maxRpm);
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
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
        throw new Error(`Reddit responded ${res.status} for ${url}`);
      }

      this.limiter.onSuccess();
      return res.json() as Promise<T>;
    }
    throw new Error(`Gave up after ${attempts} attempts for ${url}`);
  }

  /**
   * Fetch one page of r/daresgonewild new posts.
   * @param after  Reddit fullname cursor (e.g. "t3_abc123") or null for first page
   */
  async fetchSubredditNew(after?: string): Promise<{ posts: RedditPost[]; after: string | null }> {
    const params = new URLSearchParams({ limit: "100", raw_json: "1" });
    if (after) params.set("after", after);
    const listing = await this.request<RedditListing>(
      `https://www.reddit.com/r/daresgonewild/new.json?${params}`
    );
    return {
      posts: listing.data.children.map((c) => c.data),
      after: listing.data.after,
    };
  }

  /**
   * Fetch one page of a user's submissions in r/daresgonewild.
   * Reddit's /user/X/submitted endpoint returns all subs; we filter client-side.
   */
  async fetchUserSubmitted(
    username: string,
    after?: string
  ): Promise<{ posts: RedditPost[]; after: string | null }> {
    const params = new URLSearchParams({ limit: "100", raw_json: "1" });
    if (after) params.set("after", after);
    const listing = await this.request<RedditListing>(
      `https://www.reddit.com/user/${encodeURIComponent(username)}/submitted.json?${params}`
    );
    return {
      posts: listing.data.children
        .map((c) => c.data)
        .filter((p) => p.permalink.includes("/r/daresgonewild/")),
      after: listing.data.after,
    };
  }
}
