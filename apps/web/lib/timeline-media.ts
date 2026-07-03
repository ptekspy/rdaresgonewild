const IMAGE_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;

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
  const redgifsPoster = mediaUrls.find((url) => /\/\/media\.redgifs\.com\/.+-poster\.(?:jpe?g|png|webp)/i.test(url));
  if (redgifsPoster) return redgifsPoster;
  if (input.thumbnailUrl && isLikelyImage(input.thumbnailUrl)) return input.thumbnailUrl;

  const firstImage = imageUrls.find(isLikelyImage);
  if (firstImage) return firstImage;

  const firstMediaImage = mediaUrls.find(isLikelyImage);
  if (firstMediaImage) return firstMediaImage;

  if (input.outboundUrl && isLikelyImage(input.outboundUrl)) return input.outboundUrl;

  return null;
}

function isLikelyImage(url: string) {
  return IMAGE_PATTERN.test(url) || /\/\/(?:i|preview|external-preview)\.redd\.it\//i.test(url);
}
