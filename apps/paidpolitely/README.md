# PaidPolitely.com Next.js App

A drop-in standalone Next.js landing site for `paidpolitely.com`.

The page has two jobs:

1. Convert advertisers who want to purchase display ads across the PaidPolitely network.
2. Convert subreddit mods/community owners who want to bring a subreddit into the network.

## What is included

- Next.js App Router app
- TypeScript components
- Tailwind CSS v4 styling
- Static, no database required
- Env-driven contact email/site URL
- Advertiser and subreddit onboarding CTAs
- Network preview section using the current deployed sites
- Generated media assets:
  - SVG logo mark
  - SVG wordmark
  - SVG favicon
  - ICO favicon
  - Apple touch icon PNG
  - Open Graph SVG
  - Open Graph PNG
  - Noise pattern SVG
- SEO metadata, sitemap, and robots
- `example.env` and `.env.example`

## Quick start

```bash
pnpm install
cp example.env .env.local
pnpm dev
```

Local URL:

```txt
http://localhost:6791
```

## Deploy to Vercel

1. Create a new Vercel project from this folder.
2. Add the environment values from `example.env`.
3. Set the production domain to:

```txt
paidpolitely.com
www.paidpolitely.com
```

4. Build command:

```bash
pnpm build
```

5. Output: standard Next.js Vercel deployment.

## Environment variables

Copy `example.env` to `.env.local` for local development.

Important values:

```txt
NEXT_PUBLIC_SITE_URL="https://paidpolitely.com"
NEXT_PUBLIC_CONTACT_EMAIL="ads@paidpolitely.com"
NEXT_PUBLIC_SHOW_PREVIEW_SITE_LINKS="false"
```

`NEXT_PUBLIC_SHOW_PREVIEW_SITE_LINKS=false` keeps the public landing page clean by not linking directly to Vercel preview sites. Set it to `true` if you want all current previews clickable from the network section.

## Email setup

The app uses mailto links. It does not receive email itself.

Configure these with your domain/email provider:

```txt
ads@paidpolitely.com
*@paidpolitely.com
```

Suggested routing:

```txt
ads@paidpolitely.com -> your main inbox
*@paidpolitely.com -> catch-all inbox or alias group
```

## Editing current network sites

Current sites are defined in:

```txt
lib/site.ts
```

The first custom domain is `rdaresgonewild.com`; the rest are treated as Vercel previews by default.

## Suggested monorepo placement

Inside the current PaidPolitely/RDGW workspace, this can live at:

```txt
apps/paidpolitely
```

Then add/update a root script like:

```json
{
  "scripts": {
    "dev:paidpolitely": "pnpm --filter paidpolitely-com dev"
  }
}
```

You may also rename the package from `paidpolitely-com` to `@paidpolitely/web` if preferred.
