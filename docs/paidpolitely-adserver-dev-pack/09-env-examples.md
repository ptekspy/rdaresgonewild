# Environment Examples

## Root `.env.example`

```txt
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5444/paidpolitely"

# Admin
ADMIN_SECRET="change-me-to-a-long-random-secret"
ADMIN_SESSION_SECRET="change-me-to-a-long-random-session-secret"

# Paid Politely Ads
ADS_PUBLIC_BASE_URL="https://ads.paidpolitely.com"
ADS_TOKEN_SECRET="change-me-to-a-long-random-token-secret"
ADS_HASH_SALT="change-me-to-a-long-random-hash-salt"
ADS_ALLOWED_ORIGINS="https://rdaresgonewild.com,https://www.rdaresgonewild.com"

# Consumer app defaults
NEXT_PUBLIC_SITE_KEY="rdaresgonewild"
NEXT_PUBLIC_ADS_API_URL="https://ads.paidpolitely.com"
```

## `apps/adserver/.env.local`

```txt
DATABASE_URL="postgresql://postgres:postgres@localhost:5444/paidpolitely"
ADMIN_SECRET="dev-admin-secret"
ADMIN_SESSION_SECRET="dev-admin-session-secret"
ADS_PUBLIC_BASE_URL="http://localhost:3001"
ADS_TOKEN_SECRET="dev-token-secret-change-for-prod"
ADS_HASH_SALT="dev-hash-salt-change-for-prod"
ADS_ALLOWED_ORIGINS="http://localhost:6789,http://localhost:3000,http://localhost:3001,https://rdaresgonewild.com,https://www.rdaresgonewild.com"
```

## `apps/rdaresgonewild/.env.local`

```txt
DATABASE_URL="postgresql://postgres:postgres@localhost:5444/paidpolitely"
NEXT_PUBLIC_SITE_KEY="rdaresgonewild"
NEXT_PUBLIC_ADS_API_URL="http://localhost:3001"

# Existing rdaresgonewild crawler vars still apply if this app runs crawler logic
REDDIT_COOKIE="your-reddit-cookie-here"
CRAWLER_RPM=25
```

## Production notes

Generate strong secrets:

```bash
openssl rand -hex 32
```

Do not reuse:

- `ADMIN_SECRET`
- `ADMIN_SESSION_SECRET`
- `ADS_TOKEN_SECRET`
- `ADS_HASH_SALT`

Keep `NEXT_PUBLIC_*` values safe for browser exposure. Do not put private secrets in `NEXT_PUBLIC_*` env vars.
