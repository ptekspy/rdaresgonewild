export function getRedditUrl(permalink: string) {
  if (permalink.startsWith("https://reddit.com") || permalink.startsWith("https://www.reddit.com")) {
    return permalink;
  }

  return `https://reddit.com${permalink.startsWith("/") ? permalink : `/${permalink}`}`;
}
