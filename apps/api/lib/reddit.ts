export interface ExtensionRedditPost {
  id: string;
  name: string;
  subreddit: string;
  title: string;
  selftext?: string;
  author: string;
  link_flair_text?: string | null;
  score?: number;
  upvoteCount?: number | null;
  upvote_ratio?: number | null;
  num_comments?: number;
  shareCount?: number | null;
  crosspostCount?: number;
  mediaUrls?: string[];
  imageUrls?: string[];
  outboundUrl?: string | null;
  thumbnailUrl?: string | null;
  permalink: string;
  created_utc: number;
  rawJson?: unknown;
}

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
const MAX_BATCH_SIZE = 100;

export function normaliseUsername(value: unknown) {
  if (typeof value !== "string") return null;
  const username = value.replace(/^u\//i, "").trim();
  return USERNAME_PATTERN.test(username) ? username : null;
}

export function normaliseInstallId(value: unknown) {
  if (typeof value !== "string") return null;
  const installId = value.trim();
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(installId) ? installId : null;
}

export function parsePostBatch(value: unknown) {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_BATCH_SIZE) return null;

  const posts: ExtensionRedditPost[] = [];
  for (const item of value) {
    const post = parsePost(item);
    if (!post) return null;
    posts.push(post);
  }

  return posts;
}

function parsePost(value: unknown): ExtensionRedditPost | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const id = asString(record.id);
  const name = asString(record.name);
  const subreddit = asString(record.subreddit);
  const title = asString(record.title);
  const author = normaliseUsername(record.author);
  const permalink = normalisePermalink(asString(record.permalink));
  const createdUtc = asNumber(record.created_utc);

  if (!id || !name || !subreddit || !title || !author || !permalink || !createdUtc) {
    return null;
  }

  return {
    id,
    name,
    subreddit,
    title,
    selftext: asString(record.selftext) ?? "",
    author,
    link_flair_text: asNullableString(record.link_flair_text),
    score: asNumber(record.score) ?? 0,
    upvoteCount: asNullableNumber(record.upvoteCount),
    upvote_ratio: asNullableNumber(record.upvote_ratio),
    num_comments: asNumber(record.num_comments) ?? 0,
    shareCount: asNullableNumber(record.shareCount),
    crosspostCount: asNumber(record.crosspostCount) ?? 0,
    mediaUrls: asStringArray(record.mediaUrls),
    imageUrls: asStringArray(record.imageUrls),
    outboundUrl: asNullableUrl(record.outboundUrl),
    thumbnailUrl: asNullableUrl(record.thumbnailUrl),
    permalink,
    created_utc: createdUtc,
    rawJson: record.rawJson,
  };
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asNullableUrl(value: unknown) {
  const text = asString(value);
  if (!text) return null;
  return text.startsWith("http://") || text.startsWith("https://") ? text : null;
}

function normalisePermalink(value: string | null) {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://www.reddit.com${value.startsWith("/") ? value : `/${value}`}`;
}
