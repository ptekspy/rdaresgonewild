# Paid Politely Ad Server Development Pack

This pack is for Codex to implement a reusable first-party ad platform for the `paidpolitely.com` network.

The ad server will run from:

```txt
https://ads.paidpolitely.com
```

The first consumer site is:

```txt
https://rdaresgonewild.com
```

Future consumer sites include:

```txt
rprogresspics
other Paid Politely / NSFW network sites
```

## Product goal

Build a private-contract ad system that the owner can manage directly.

This is not an ad marketplace yet. It is a first-party ad platform for manually sold campaigns, with a clean path to later self-serve advertiser accounts.

## Target monorepo shape

The current repo already has a pnpm/Turbo workspace using `apps/*` and `packages/*`.

Target shape:

```txt
apps/
  rdaresgonewild/       # existing site, renamed/moved from apps/web if desired
  rprogresspics/        # future site
  adserver/             # public ad-serving API at ads.paidpolitely.com
  admin/                # private owner dashboard

packages/
  database/             # shared Prisma schema/client
  ads-sdk/              # React/Next client used by all public sites
  ui/                   # shared UI components
  config/               # shared tsconfig/eslint/tailwind/env helpers
  shared/               # shared types/utilities
```

## First implementation path

Do not attempt to build everything at once.

Implement in this order:

1. Extend database schema with proper ad platform models.
2. Add `apps/adserver` with the public API.
3. Add `packages/ads-sdk` with `<AdSlot />` for consumer sites.
4. Replace the existing `rdaresgonewild` ad component with the SDK.
5. Add a simple owner-only `apps/admin` dashboard.
6. Add reporting and daily aggregation.
7. Add advertiser access later, only after the owner workflow is stable.

## Hard requirements

- The ad server must be cross-site.
- Each site must identify itself with a stable `SITE_KEY`, for example `rdaresgonewild`.
- Each ad placement must be identified by a stable placement key, for example `homepage_top`.
- Consumer sites must not directly query advertiser/campaign financial data.
- Public API responses must only return safe creative data needed to render an ad.
- All outbound paid links must use adserver click redirects.
- All paid links must be labelled as sponsored/advertising in the rendered UI.
- No advertiser-supplied JavaScript in MVP.
- Raw HTML creatives are allowed only for owner/admin controlled house ads, and must be disabled by default.
- Impression tracking must fire from the browser when the ad becomes visible, not just when the page renders.
- Do not store raw IP addresses. Store no IP at all for MVP, or store salted hashes only.

## Naming convention

Use `Paid Politely Ads` as the product/system name in code comments and docs.

Recommended package names:

```txt
@paidpolitely/database
@paidpolitely/ads-sdk
@paidpolitely/shared
@paidpolitely/ui
```

If changing package names is too invasive for the first PR, keep existing names and only add the new packages. Do not block implementation on a repo-wide rename.
