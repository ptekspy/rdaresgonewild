# Paid Politely Reddit Sync Extension

This is a Manifest V3 Chrome extension that crawls the Reddit page the user is currently viewing and syncs post details to the Paid Politely API.

## Local install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `apps/chrome-extension`.

## Local API testing

Set the popup API endpoint to:

```text
http://localhost:8787
```

When the Cloudflare Tunnel is running, use:

```text
https://api.paidpolitely.com
```

## Publishing notes

## How crawling works

1. Open any Reddit page, such as a subreddit, user profile, search page, or listing.
2. Click the extension.
3. Click "Crawl page".

The extension runs a concurrent pipeline:

1. A page-side crawler keeps scrolling and parsing newly lazy-loaded post links.
2. Background fetch workers concurrently fetch each post's Reddit JSON.
3. A background uploader concurrently sends normalized post batches to the API.

The scroller does not wait for parsing or uploads to finish before continuing down the page.

Before submitting to the Chrome Web Store, add final icons, screenshots, and a privacy policy URL. The listing should clearly state that the extension crawls the current Reddit page at the user's request, and that it does not collect Reddit cookies, passwords, or private messages.
