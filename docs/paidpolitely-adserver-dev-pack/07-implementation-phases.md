# Implementation Phases

## Phase 0 — repo prep

Goal: prepare repo without breaking current site.

Tasks:

- Confirm current workspace builds.
- Add new app/package skeletons.
- Keep existing `apps/web` working.
- Decide whether to rename `apps/web` to `apps/rdaresgonewild` now or later.

Recommendation:

Do not rename in the first PR unless Codex can update all references safely. Add new adserver/sdk first.

## Phase 1 — schema and seed

Goal: create the ad platform data model.

Tasks:

- Add new Prisma enums and models.
- Run Prisma generate.
- Add seed script.
- Seed `rdaresgonewild` site and placements.
- Add internal advertiser/campaign/creative/booking for testing.

Acceptance:

- `pnpm db:generate` passes.
- `pnpm db:push` or migration passes locally.
- Seed creates site/placements without duplicates.

## Phase 2 — adserver public API

Goal: serve one safe ad from the central adserver.

Tasks:

- Create `apps/adserver` Next app.
- Add `/api/v1/ad` route.
- Add booking selection logic.
- Add signed impression/click token helpers.
- Add `/api/v1/impression` route.
- Add `/api/v1/click/[token]` route.
- Add CORS/origin handling.

Acceptance:

- `GET /api/v1/ad?site=rdaresgonewild&placement=homepage_top&path=/` returns test creative.
- Impression POST records one impression.
- Duplicate impression token does not double-count.
- Click URL records click and redirects.
- Unsupported target protocols are rejected.

## Phase 3 — ads SDK

Goal: make consumer integration trivial.

Tasks:

- Create `packages/ads-sdk`.
- Add shared response types.
- Add fetch helper.
- Add React `AdSlot` client component.
- Add IntersectionObserver impression tracking.
- Add graceful failure behaviour.

Acceptance:

- Component renders a test ad.
- Component renders nothing on no-ad response.
- Component does not crash on failed fetch.
- Impression fires once after visible threshold.
- Anchor uses `rel="sponsored nofollow noopener noreferrer"`.

## Phase 4 — rdaresgonewild integration

Goal: replace embedded ad system in first site.

Tasks:

- Add consumer env vars.
- Replace local `AdSlot` with SDK or compatibility wrapper.
- Map old `slotKey` values to new `placement` keys.
- Verify live pages.

Acceptance:

- Homepage ad renders.
- Leaderboard ad renders.
- Profile ad renders.
- Dare picker ad renders.
- Site works when adserver is unavailable.

## Phase 5 — owner admin

Goal: manage private contracts without editing DB manually.

Tasks:

- Add admin auth.
- Build CRUD for sites/placements.
- Build CRUD for advertisers.
- Build CRUD for campaigns.
- Build CRUD for creatives.
- Build CRUD for bookings.
- Add creative preview.
- Add simple report page.

Acceptance:

- Owner can create a campaign end-to-end.
- Owner can pause a booking.
- Owner can approve/reject a creative.
- Owner can export campaign report as CSV.

## Phase 6 — reporting polish

Goal: make reporting useful for private contracts.

Tasks:

- Add daily aggregation job or on-demand aggregation query.
- Report by campaign/date/placement/creative.
- Add CSV export.
- Add private shareable report page if desired.

Acceptance:

- Report shows impressions, clicks, CTR.
- Report can be sent to advertiser manually.

## Phase 7 — later self-serve

Not MVP.

Potential future work:

- advertiser login
- Stripe checkout
- creative upload
- moderation queue
- invoices
- campaign approval workflow
- advertiser report portal
- budget/cap billing enforcement
