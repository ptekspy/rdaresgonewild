function assertSafeMailtoUrl(url: URL) {
  const recipient = decodeURIComponent(url.pathname);
  const recipients = recipient.split(",").map((item) => item.trim()).filter(Boolean);

  if (recipients.length === 0 || recipients.some((item) => !/^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(item))) {
    throw new Error("Invalid mailto recipient");
  }

  for (const key of url.searchParams.keys()) {
    if (key !== "subject" && key !== "body") {
      throw new Error("Unsupported mailto parameter");
    }
  }
}

export function assertSafeClickTargetUrl(value: string) {
  const url = new URL(value);

  if (url.protocol === "https:") {
    return url;
  }

  if (url.protocol === "mailto:") {
    assertSafeMailtoUrl(url);
    return url;
  }

  throw new Error("Only HTTPS and mailto target URLs are allowed");
}
