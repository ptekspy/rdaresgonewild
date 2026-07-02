# Current Repo Context

Repository:

```txt
https://github.com/ptekspy/rdaresgonewild
```

Current relevant facts observed from the repo:

- Workspace uses `pnpm` and `turbo`.
- Workspace globs are already `apps/*` and `packages/*`.
- Existing app package is `apps/web`, package name `@rdgw/web`.
- Existing database package is `packages/database`, package name `@rdgw/database`.
- Existing database uses Prisma with PostgreSQL.
- Existing `apps/web` uses Next.js 16, React 19, Tailwind 4, and OpenNext Cloudflare/Wrangler scripts.
- Existing schema already has basic ad models:
  - `AdSlot`
  - `AdContent`
- Existing `AdSlot` component directly reads from the app database and renders the highest-priority active content for a slot.
- Existing `.env.example` includes `DATABASE_URL`, `ADMIN_SECRET`, Reddit crawler env vars, and crawler limits.

## Current limitation

The existing ad model is site-local:

```txt
AdSlot -> AdContent
```

That is good enough for one site, but it does not support the target network model:

```txt
Site -> Placement -> Booking -> Creative -> Campaign -> Advertiser
```

## Migration goal

Move from embedded ads in `rdaresgonewild` to a first-party reusable ad platform:

```txt
rdaresgonewild.com
  imports @paidpolitely/ads-sdk
  renders <AdSlot placement="homepage_top" />

ads.paidpolitely.com
  owns campaign selection, tracking, click redirects, and reporting

admin.paidpolitely.com or ads.paidpolitely.com/admin
  owner-only management dashboard
```

## Keep from existing implementation

Reuse the idea of stable slot keys, active windows, priority, image creative, link URL, and labels.

## Replace / evolve

Replace `AdSlot`/`AdContent` as the long-term source of truth with:

```txt
Site
Placement
Advertiser
Campaign
Creative
Booking
AdImpression
AdClick
DailyAdStats
```

`AdSlot` in the consumer app becomes a rendering component from `packages/ads-sdk`, not a direct DB query.
