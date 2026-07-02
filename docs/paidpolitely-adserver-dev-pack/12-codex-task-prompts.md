# Codex Task Prompts

Use these as sequential prompts. Do not ask Codex to do the entire platform in one go unless you want a messy PR.

## Prompt 1 — schema

```txt
Implement Phase 1 of the Paid Politely Ads platform.

Context:
- This is a pnpm/Turbo monorepo.
- Existing database package is packages/database.
- Existing Prisma schema already contains rdaresgonewild models and basic AdSlot/AdContent models.

Task:
- Add new network-wide ad platform Prisma models and enums for Site, Placement, Advertiser, Campaign, Creative, Booking, AdImpression, AdClick, and DailyAdStats.
- Keep existing AdSlot/AdContent models for now; do not remove them.
- Add a seed script that creates the rdaresgonewild Site and the initial placements listed in this dev pack.
- Add a house advertiser/campaign/creative/booking for homepage_top.
- Update package scripts if needed for db:seed.
- Ensure pnpm db:generate and type-check pass.

Do not implement adserver API yet.
```

## Prompt 2 — adserver public API

```txt
Implement Phase 2 of the Paid Politely Ads platform.

Task:
- Create apps/adserver as a Next app running locally on port 3001.
- Add GET /api/v1/ad.
- Add POST /api/v1/impression.
- Add GET /api/v1/click/[token].
- Add booking selection logic using the new Prisma models.
- Add HMAC signed token helpers for impression and click tokens.
- Add safe URL validation so only HTTPS target URLs are redirected to.
- Return only safe public creative fields.
- Use Cache-Control: no-store.
- Add basic CORS handling using ADS_ALLOWED_ORIGINS.
- Add tests for token verification and selection logic if test tooling exists; otherwise add a small internal test script.

Do not build admin UI yet.
```

## Prompt 3 — ads SDK

```txt
Implement Phase 3 of the Paid Politely Ads platform.

Task:
- Create packages/ads-sdk.
- Export @paidpolitely/ads-sdk/react with an AdSlot component.
- The component should read NEXT_PUBLIC_SITE_KEY and NEXT_PUBLIC_ADS_API_URL by default.
- It should fetch GET /api/v1/ad for the given placement.
- It should render IMAGE, TEXT, and IMAGE_TEXT creatives.
- It should show a visible Sponsored/Ad label.
- It should use rel="sponsored nofollow noopener noreferrer" for clicks.
- It should track impressions with IntersectionObserver after 50% visibility for at least 1000ms.
- It should fail gracefully if the adserver is unavailable.

Do not migrate rdaresgonewild yet except for adding package dependency if needed.
```

## Prompt 4 — rdaresgonewild migration

```txt
Migrate rdaresgonewild to use @paidpolitely/ads-sdk.

Task:
- Add NEXT_PUBLIC_SITE_KEY and NEXT_PUBLIC_ADS_API_URL env docs/examples.
- Replace the existing local AdSlot implementation with a compatibility wrapper around @paidpolitely/ads-sdk.
- Keep existing call sites working by mapping slotKey -> placement.
- Ensure the site still builds.
- Ensure adserver outage does not crash pages.
- Verify homepage_top, leaderboard_top, profile_sidebar, dare_picker_top placements render via the adserver.

Do not remove old Prisma AdSlot/AdContent models yet.
```

## Prompt 5 — admin MVP

```txt
Implement the owner-only admin MVP for Paid Politely Ads.

Task:
- Add /admin routes in apps/adserver unless a separate apps/admin already exists.
- Implement ADMIN_SECRET login with a signed HTTP-only session cookie.
- Add pages for Sites, Placements, Advertisers, Campaigns, Creatives, Bookings, and Reports.
- Implement create/edit/pause flows for each main entity.
- Add creative preview and approval/rejection.
- Add campaign report showing impressions, clicks, CTR, by day and by placement.
- Add CSV export for campaign report.
- Keep styling simple and functional.

Do not add advertiser self-serve login yet.
```

## Prompt 6 — production hardening

```txt
Harden Paid Politely Ads for production.

Task:
- Review all public API responses for private data leakage.
- Ensure admin routes cannot be accessed without auth.
- Ensure all secrets are server-only.
- Add no-store headers to ad responses.
- Add strict redirect URL validation.
- Add CORS config for production domains.
- Add rate limiting to impression and click endpoints if practical.
- Add basic audit logging for admin mutations if time allows.
- Update README and .env.example with production deployment notes for ads.paidpolitely.com.
```
