import { RateLimiter } from "./rate-limiter.js";

export interface RedditPost {
  id: string;          // without t3_ prefix
  name: string;        // full name e.g. t3_abc123
  title: string;
  selftext: string;
  author: string;
  link_flair_text: string | null;
  score: number;
  upvoteCount: number | null;
  upvote_ratio: number | null;
  num_comments: number;
  shareCount: number | null;
  crosspostCount: number;
  mediaUrls: string[];
  imageUrls: string[];
  outboundUrl: string | null;
  thumbnailUrl: string | null;
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

export type SubredditListingSort = "new" | "best" | "hot" | "top";
export type SubredditTopTimeWindow = "day" | "week" | "month" | "year" | "all";

export interface RedditListingClient {
  readonly targetSubreddit: string;
  fetchSubredditListing(
    sort: SubredditListingSort,
    after?: string,
    options?: { topTime?: SubredditTopTimeWindow }
  ): Promise<RedditListingPage>;
  fetchSubredditNew(after?: string): Promise<RedditListingPage>;
  fetchUserSubmitted(username: string, after?: string): Promise<RedditListingPage>;
}

export interface RedditListing {
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
  ups?: number;
  upvote_ratio?: number | null;
  num_comments?: number;
  share_count?: number | null;
  num_crossposts?: number;
  url?: string;
  url_overridden_by_dest?: string;
  thumbnail?: string;
  preview?: RawRedditPreview;
  media?: RawRedditMedia | null;
  secure_media?: RawRedditMedia | null;
  media_metadata?: Record<string, RawRedditMediaMetadata | undefined>;
  gallery_data?: RawRedditGalleryData;
  crosspost_parent_list?: RawRedditPost[];
  permalink?: string;
  created_utc?: number;
  subreddit?: string;
}

interface RawRedditPreviewImageSource {
  url?: string;
  width?: number;
  height?: number;
}

interface RawRedditPreviewImage {
  source?: RawRedditPreviewImageSource;
  resolutions?: RawRedditPreviewImageSource[];
  variants?: Record<string, { source?: RawRedditPreviewImageSource; resolutions?: RawRedditPreviewImageSource[] }>;
}

interface RawRedditVideo {
  fallback_url?: string;
  scrubber_media_url?: string;
  hls_url?: string;
  dash_url?: string;
}

interface RawRedditPreview {
  images?: RawRedditPreviewImage[];
  reddit_video_preview?: RawRedditVideo;
}

interface RawRedditMedia {
  reddit_video?: RawRedditVideo;
  oembed?: {
    thumbnail_url?: string;
    url?: string;
  };
}

interface RawRedditMediaMetadataImage {
  u?: string;
  url?: string;
  gif?: string;
  mp4?: string;
}

interface RawRedditMediaMetadata {
  s?: RawRedditMediaMetadataImage;
  p?: RawRedditMediaMetadataImage[];
  o?: RawRedditMediaMetadataImage[];
}

interface RawRedditGalleryData {
  items?: Array<{ media_id?: string }>;
}

const DEFAULT_SUBREDDIT = "daresgonewild";
const IMAGE_URL_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;
const REDDIT_IMAGE_HOST_PATTERN = /\/\/(?:i|preview)\.redd\.it\//i;
const IGNORE_THUMBNAILS = new Set(["default", "self", "nsfw", "spoiler", "image", ""]);

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

  async fetchSubredditListing(
    sort: SubredditListingSort,
    after?: string,
    options: { topTime?: SubredditTopTimeWindow } = {}
  ): Promise<RedditListingPage> {
    const params = new URLSearchParams({ limit: "100", raw_json: "1" });
    if (after) params.set("after", after);
    if (sort === "top" && options.topTime) params.set("t", options.topTime);

    const listing = await this.request<RedditListing>(
      `https://www.reddit.com/r/${encodeURIComponent(this.subreddit)}/${sort}.json?${params}`
    );

    return normaliseListingPage(listing);
  }

  async fetchSubredditNew(after?: string): Promise<RedditListingPage> {
    return this.fetchSubredditListing("new", after);
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

export function normaliseListingPage(listing: RedditListing): RedditListingPage {
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

export function normalisePost(raw: RawRedditPost): RedditPost | null {
  if (!raw.id || !raw.name || !raw.title || !raw.author || !raw.created_utc) return null;
  if (raw.author === "[deleted]") return null;

  const permalink = normalisePermalink(raw.permalink ?? `/comments/${raw.id}`);
  const urls = extractPostUrls(raw, permalink);

  return {
    id: raw.id,
    name: raw.name,
    title: raw.title,
    selftext: raw.selftext ?? "",
    author: raw.author,
    link_flair_text: raw.link_flair_text ?? null,
    score: raw.score ?? 0,
    upvoteCount: raw.ups ?? null,
    upvote_ratio: raw.upvote_ratio ?? null,
    num_comments: raw.num_comments ?? 0,
    shareCount: raw.share_count ?? null,
    crosspostCount: raw.num_crossposts ?? 0,
    mediaUrls: urls.mediaUrls,
    imageUrls: urls.imageUrls,
    outboundUrl: urls.outboundUrl,
    thumbnailUrl: urls.thumbnailUrl,
    permalink,
    created_utc: raw.created_utc,
  };
}

function normalisePermalink(permalink: string) {
  if (permalink.startsWith("http://") || permalink.startsWith("https://")) {
    return permalink;
  }

  return `https://www.reddit.com${permalink.startsWith("/") ? permalink : `/${permalink}`}`;
}

function extractPostUrls(raw: RawRedditPost, permalink: string) {
  const mediaUrls = new Set<string>();
  const imageUrls = new Set<string>();
  const thumbnailUrl = normaliseMediaUrl(raw.thumbnail);
  const outboundUrl = extractOutboundUrl(raw, permalink);

  const addMediaUrl = (value?: string | null, options: { image?: boolean } = {}) => {
    const url = normaliseMediaUrl(value);
    if (!url) return;
    mediaUrls.add(url);
    if (options.image || isImageUrl(url)) {
      imageUrls.add(url);
    }
  };

  addMediaUrl(outboundUrl, { image: isImageUrl(outboundUrl) });
  addMediaUrl(thumbnailUrl, { image: true });
  addPreview(raw.preview, addMediaUrl);
  addMedia(raw.media, addMediaUrl);
  addMedia(raw.secure_media, addMediaUrl);
  addGallery(raw, addMediaUrl);

  for (const crosspost of raw.crosspost_parent_list ?? []) {
    const crosspostPermalink = normalisePermalink(crosspost.permalink ?? `/comments/${crosspost.id ?? ""}`);
    const crosspostUrls = extractPostUrls(crosspost, crosspostPermalink);
    for (const url of crosspostUrls.mediaUrls) mediaUrls.add(url);
    for (const url of crosspostUrls.imageUrls) imageUrls.add(url);
  }

  return {
    mediaUrls: [...mediaUrls],
    imageUrls: [...imageUrls],
    outboundUrl,
    thumbnailUrl,
  };
}

function extractOutboundUrl(raw: RawRedditPost, permalink: string) {
  const directUrl = normaliseMediaUrl(raw.url_overridden_by_dest) ?? normaliseMediaUrl(raw.url);
  if (!directUrl) return null;

  const permalinkUrl = normaliseMediaUrl(permalink);
  return permalinkUrl && stripUrlQuery(directUrl) === stripUrlQuery(permalinkUrl) ? null : directUrl;
}

function addPreview(
  preview: RawRedditPreview | undefined,
  addMediaUrl: (value?: string | null, options?: { image?: boolean }) => void
) {
  for (const image of preview?.images ?? []) {
    addMediaUrl(image.source?.url, { image: true });
    for (const resolution of image.resolutions ?? []) {
      addMediaUrl(resolution.url, { image: true });
    }

    for (const variant of Object.values(image.variants ?? {})) {
      addMediaUrl(variant.source?.url, { image: true });
      for (const resolution of variant.resolutions ?? []) {
        addMediaUrl(resolution.url, { image: true });
      }
    }
  }

  addVideo(preview?.reddit_video_preview, addMediaUrl);
}

function addMedia(
  media: RawRedditMedia | null | undefined,
  addMediaUrl: (value?: string | null, options?: { image?: boolean }) => void
) {
  addVideo(media?.reddit_video, addMediaUrl);
  addMediaUrl(media?.oembed?.thumbnail_url, { image: true });
  addMediaUrl(media?.oembed?.url);
}

function addVideo(
  video: RawRedditVideo | undefined,
  addMediaUrl: (value?: string | null, options?: { image?: boolean }) => void
) {
  addMediaUrl(video?.fallback_url);
  addMediaUrl(video?.scrubber_media_url);
  addMediaUrl(video?.hls_url);
  addMediaUrl(video?.dash_url);
}

function addGallery(
  raw: RawRedditPost,
  addMediaUrl: (value?: string | null, options?: { image?: boolean }) => void
) {
  const mediaIds = new Set(
    raw.gallery_data?.items?.map((item) => item.media_id).filter((id): id is string => Boolean(id))
  );
  const entries = Object.entries(raw.media_metadata ?? {});

  for (const [mediaId, metadata] of entries) {
    if (mediaIds.size > 0 && !mediaIds.has(mediaId)) continue;
    addMediaMetadataImage(metadata?.s, addMediaUrl);
    for (const preview of metadata?.p ?? []) addMediaMetadataImage(preview, addMediaUrl);
    for (const original of metadata?.o ?? []) addMediaMetadataImage(original, addMediaUrl);
  }
}

function addMediaMetadataImage(
  image: RawRedditMediaMetadataImage | undefined,
  addMediaUrl: (value?: string | null, options?: { image?: boolean }) => void
) {
  addMediaUrl(image?.u ?? image?.url, { image: true });
  addMediaUrl(image?.gif, { image: true });
  addMediaUrl(image?.mp4);
}

function normaliseMediaUrl(value?: string | null) {
  if (!value) return null;
  const decoded = decodeHtmlEntities(value.trim());
  if (!decoded.startsWith("http://") && !decoded.startsWith("https://")) return null;
  if (IGNORE_THUMBNAILS.has(decoded.toLowerCase())) return null;
  return decoded;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isImageUrl(value?: string | null) {
  if (!value) return false;
  return IMAGE_URL_PATTERN.test(value) || REDDIT_IMAGE_HOST_PATTERN.test(value);
}

function stripUrlQuery(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return value.replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}
