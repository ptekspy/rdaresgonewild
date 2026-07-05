# Paid Politely local Reddit DOM crawler

This drop-in replaces the slow "collect links then fetch each post JSON" browser crawler with a DOM-first crawler.

## What changes

- The extension parses visible `shreddit-post` cards directly from the Reddit listing page.
- It streams parsed posts while scrolling.
- It no longer opens/fetches every post JSON URL.
- It writes to your database through a local-only Node writer on `127.0.0.1`.
- The local writer uses your existing `@rdgw/database` Prisma package.

A Chrome extension cannot safely use Prisma/Postgres directly in the browser: it has no Node runtime or raw TCP socket support, and putting `DATABASE_URL` in the extension would expose it. This package uses the next-best local-only version: the extension talks only to `http://127.0.0.1:8791`, and the local writer does the Prisma write.

## Install

From the repo root, after extracting this zip:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-local-reddit-dom-crawler.ps1
```

That script:

1. Backs up overwritten files into `.crawler-dropin-backups/<timestamp>/`
2. Copies the new Chrome extension files
3. Adds `packages/reddit-local-db-writer`
4. Adds root scripts:
   - `crawler:local-db`
   - `crawler:extension:zip`
5. Runs `pnpm install`
6. Runs `pnpm db:generate`
7. Builds `dist/paid-politely-reddit-dom-crawler-extension.zip`

## Run

Start the local DB writer:

```bash
pnpm crawler:local-db
```

Then load the extension:

```text
chrome://extensions
Developer mode on
Load unpacked
Select apps/chrome-extension
```

Open Reddit, go to home, `/new`, a subreddit, or a user page, then click **Crawl page**.

## Rebuild the extension zip

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-reddit-extension-zip.ps1
```

Output:

```text
dist\paid-politely-reddit-dom-crawler-extension.zip
```

## Media extraction

The parser is tuned for Reddit's current `shreddit-post` HTML:

- Core post fields come from `shreddit-post` attributes:
  - `id`
  - `post-title`
  - `author`
  - `subreddit-prefixed-name`
  - `subreddit-name`
  - `score`
  - `comment-count`
  - `created-timestamp`
  - `post-type`
  - `domain`
  - `content-href`
- Images are extracted from:
  - direct `content-href` values like `https://i.redd.it/...`
  - `.media-lightbox-img`
  - `img[src]`
  - `img[srcset]`, choosing the largest listed width
  - Reddit gallery carousel images
- Videos/embeds are extracted from:
  - `content-href` Redgifs links
  - `shreddit-embed[html]` iframe URLs
  - `shreddit-player` URL attributes
  - `video[src]`, `video[poster]`, and `source[src]`
- Avatars, subreddit icons, emoji badges, snoovatars, and redditstatic assets are filtered out.

## Endpoints used locally

The extension uses:

```text
GET  http://127.0.0.1:8791/health
POST http://127.0.0.1:8791/session/start
POST http://127.0.0.1:8791/posts/stream
POST http://127.0.0.1:8791/session/complete
```

Only loopback requests are accepted by default.

## Environment

The local writer uses the same DB loading behaviour as `@rdgw/database`.

Make sure your database env exists where your database package already expects it, usually one of:

```text
DATABASE_URL=...
DATABASE_DRIVER=neon
```

or your existing package `.env`.

