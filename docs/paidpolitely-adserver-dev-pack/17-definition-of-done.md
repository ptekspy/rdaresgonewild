# Definition of Done

The project is done for MVP when all of this is true:

## Infrastructure

- `apps/adserver` exists and can deploy to `ads.paidpolitely.com`.
- Required env vars are documented.
- Local dev can run adserver and rdaresgonewild together.

## Data

- Network ad schema exists.
- `rdaresgonewild` site and placements are seeded.
- House ad can be seeded.

## Serving

- `GET /api/v1/ad` returns a safe ad or null.
- Booking selection respects status, dates, enabled flags, and caps.
- Ad response does not leak private data.

## Tracking

- Impression endpoint records viewable impressions idempotently.
- Click endpoint records clicks and redirects safely.
- Reports can count impressions/clicks.

## SDK

- Consumer sites can render `<AdSlot placement="..." />`.
- SDK gracefully handles adserver failure.
- SDK tracks viewable impressions.
- SDK labels ads visibly.
- SDK uses sponsored/nofollow/noopener/noreferrer rel attributes.

## rdaresgonewild integration

- Existing site renders ads from adserver.
- Existing pages do not crash without ads.
- Old local ad DB reads are no longer used for public rendering.

## Admin

- Owner can login.
- Owner can create advertiser/campaign/creative/booking.
- Owner can pause/enable bookings.
- Owner can see a campaign report.

## Safety

- No advertiser JS in MVP.
- No raw IP storage unless intentionally implemented with hashing.
- Target URLs are HTTPS only.
- Adult ad moderation fields exist.
- Creatives can be approved/rejected.
