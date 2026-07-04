# Paid Politely Reddit Stream Crawler drop-in

This drop-in upgrades the Chrome extension crawler and the extension API.

## What it adds

- Manual crawl from the current Reddit tab.
- Works on Reddit home, `/new`, subreddit pages, sort pages, search pages, and user pages.
- Scrolls lazy-loaded Reddit pages until the page stops producing new post links.
- Fetches each discovered Reddit post JSON while scrolling continues.
- Streams posts into the API in small batches instead of waiting until the end.
- Supports separate crawls in separate Chrome tabs/windows because state is keyed by `tabId`.
- Adds a dedicated API route at `/api/v1/extension/posts/stream` while keeping the old `/batch` route as a compatibility alias.
- Fixes crawl-mode handling so non-profile crawls do not accidentally filter posts by author.

## Apply it

From the root of `ptekspy/rdaresgonewild`, after extracting this zip:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-reddit-stream-crawler.ps1
```

Useful flags:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-reddit-stream-crawler.ps1 -SkipInstall
powershell -ExecutionPolicy Bypass -File .\setup-reddit-stream-crawler.ps1 -SkipTypeCheck
```

The setup script backs up overwritten files under `.paidpolitely-crawler-backup/<timestamp>`.

## Run the API

```bash
pnpm dev:api
```

The API runs on `http://localhost:8787`.

## Build the extension zip again

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-reddit-extension-zip.ps1
```

Bash:

```bash
./scripts/build-reddit-extension-zip.sh
```

Output:

```text
dist/chrome-extension/paid-politely-reddit-stream-crawler.zip
```

## Install in Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `apps/chrome-extension`.
5. Start the API with `pnpm dev:api`.
6. Open a Reddit page.
7. Click the extension.
8. Confirm the API endpoint is `http://localhost:8787`.
9. Click **Crawl current page**.

## API endpoints

```text
POST /api/v1/extension/sessions
POST /api/v1/extension/posts/stream
POST /api/v1/extension/posts/batch
GET  /api/v1/extension/sessions/:sessionId
POST /api/v1/extension/sessions/:sessionId/complete
```

The extension normally uses `sessions` and `posts/stream`. The `posts/batch` endpoint remains as a compatibility wrapper around the same ingestion function.
