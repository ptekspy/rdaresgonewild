# Deployment Plan

Target production domain:

```txt
ads.paidpolitely.com
```

## Recommended deployment

Because the existing web app already has OpenNext Cloudflare/Wrangler scripts, keep the deployment approach consistent if possible.

Options:

### Option A — Cloudflare Workers/Pages via OpenNext

Good fit if the existing app already deploys this way.

Needs:

- Cloudflare zone for `paidpolitely.com`
- DNS CNAME/route for `ads.paidpolitely.com`
- environment variables configured in Cloudflare
- database reachable from edge/runtime, for example Neon Postgres

### Option B — Vercel

Simpler for Next apps if database connectivity is straightforward.

Needs:

- project for `apps/adserver`
- domain `ads.paidpolitely.com`
- env vars in Vercel
- production database

### Option C — Docker VPS

Most control, slightly more ops.

Needs:

- Node runtime container
- Postgres/Neon external DB
- reverse proxy
- TLS
- deploy script

## Production env

```txt
DATABASE_URL="postgresql://..."
ADMIN_SECRET="..."
ADMIN_SESSION_SECRET="..."
ADS_PUBLIC_BASE_URL="https://ads.paidpolitely.com"
ADS_TOKEN_SECRET="..."
ADS_HASH_SALT="..."
ADS_ALLOWED_ORIGINS="https://rdaresgonewild.com,https://www.rdaresgonewild.com,https://rprogresspics.com,https://www.rprogresspics.com"
```

## DNS

Create:

```txt
ads.paidpolitely.com -> deployment target
```

If using separate admin domain:

```txt
admin.paidpolitely.com -> deployment target
```

## First production smoke test

```bash
curl "https://ads.paidpolitely.com/api/v1/ad?site=rdaresgonewild&placement=homepage_top&path=/"
```

Expected:

```json
{
  "ok": true,
  "ad": null
}
```

or a valid safe ad JSON object.

## Rollout plan

1. Deploy adserver with only house ads.
2. Test live API.
3. Add SDK to `rdaresgonewild` production.
4. Confirm no page crashes if adserver fails.
5. Confirm impressions/clicks are recorded.
6. Add first real private sponsor.
7. Monitor logs for 24 hours.

## Rollback plan

Consumer sites must be resilient. If the adserver fails:

- SDK should render nothing.
- Site should continue working.

Rollback options:

- set `NEXT_PUBLIC_ADS_API_URL` back to local/no-op endpoint
- remove `<AdSlot />` usages
- disable placements in admin
- pause all bookings
