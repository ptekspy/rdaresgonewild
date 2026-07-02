export function assertSafeHttpsUrl(value: string) {
  const url = new URL(value);

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS target URLs are allowed");
  }

  return url;
}
