const IMAGE_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;
const REDDIT_IMAGE_PATTERN = /\/\/(?:i|preview)\.redd\.it\//i;
const REDGIFS_POSTER_PATTERN = /\/\/media\.redgifs\.com\/.+-poster\.(?:jpe?g|png|webp)/i;
const FRAGILE_THUMB_PATTERN = /\/\/(?:a|b)\.thumbs\.redditmedia\.com\//i;
const EXTERNAL_PREVIEW_PATTERN = /\/\/external-preview\.redd\.it\//i;

export function hasRedgifsUrl(outboundUrl: string | null | undefined, mediaUrls: readonly string[] = []) {
  return Boolean(
    (outboundUrl && outboundUrl.toLowerCase().includes("redgifs.com")) ||
      mediaUrls.some((url) => url.toLowerCase().includes("redgifs.com"))
  );
}

export function selectTimelinePreview(input: {
  thumbnailUrl?: string | null;
  imageUrls?: readonly string[];
  mediaUrls?: readonly string[];
  outboundUrl?: string | null;
}) {
  const mediaUrls = input.mediaUrls ?? [];
  const imageUrls = input.imageUrls ?? [];

  const redgifsPoster = [...mediaUrls, ...imageUrls].find((url) => REDGIFS_POSTER_PATTERN.test(url));
  if (redgifsPoster) return redgifsPoster;

  const candidates = unique([
    ...imageUrls,
    ...mediaUrls,
    input.outboundUrl ?? "",
  ])
    .filter(isLikelyImage)
    .filter((url) => !isFragileThumbnail(url))
    .sort((a, b) => scorePreviewUrl(b) - scorePreviewUrl(a));

  if (candidates[0]) return candidates[0];

  if (input.thumbnailUrl && isLikelyImage(input.thumbnailUrl) && !isFragileThumbnail(input.thumbnailUrl)) {
    return input.thumbnailUrl;
  }

  return null;
}

function unique(values: readonly string[]) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

function isLikelyImage(url: string) {
  return IMAGE_PATTERN.test(url) || REDDIT_IMAGE_PATTERN.test(url) || REDGIFS_POSTER_PATTERN.test(url);
}

function isFragileThumbnail(url: string) {
  return FRAGILE_THUMB_PATTERN.test(url) || EXTERNAL_PREVIEW_PATTERN.test(url);
}

function scorePreviewUrl(url: string) {
  if (REDGIFS_POSTER_PATTERN.test(url)) return 100;
  if (/\/\/i\.redd\.it\//i.test(url)) return 90;
  if (/\/\/preview\.redd\.it\//i.test(url)) return 80;
  if (IMAGE_PATTERN.test(url)) return 70;
  return 0;
}