# Local Development and Scripts

## Recommended ports

```txt
apps/rdaresgonewild  -> http://localhost:6789  # current app already uses 6789
apps/adserver        -> http://localhost:3001
apps/admin           -> http://localhost:3002 if separate
```

If admin is colocated in adserver, use:

```txt
http://localhost:3001/admin
```

## Root scripts to add

In root `package.json`, add useful filters:

```json
{
  "scripts": {
    "dev": "turbo dev",
    "dev:adserver": "pnpm --filter @paidpolitely/adserver dev",
    "dev:rdgw": "pnpm --filter @rdgw/web dev",
    "build": "pnpm db:generate && turbo build",
    "type-check": "turbo type-check",
    "lint": "turbo lint",
    "db:generate": "pnpm --filter @paidpolitely/database db:generate",
    "db:push": "pnpm --filter @paidpolitely/database db:push",
    "db:migrate": "pnpm --filter @paidpolitely/database db:migrate",
    "db:studio": "pnpm --filter @paidpolitely/database db:studio",
    "db:seed": "pnpm --filter @paidpolitely/database db:seed"
  }
}
```

If the package is still `@rdgw/database`, adapt filters accordingly.

## Local smoke test

1. Install deps:

```bash
pnpm install
```

2. Generate Prisma client:

```bash
pnpm db:generate
```

3. Push/migrate DB:

```bash
pnpm db:push
```

4. Seed ads:

```bash
pnpm db:seed
```

5. Start adserver:

```bash
pnpm dev:adserver
```

6. Start consumer site:

```bash
pnpm dev:rdgw
```

7. Visit:

```txt
http://localhost:6789
```

8. Verify API directly:

```bash
curl "http://localhost:3001/api/v1/ad?site=rdaresgonewild&placement=homepage_top&path=/"
```

## Suggested package skeleton

```txt
apps/adserver/
  app/
    api/
      v1/
        ad/route.ts
        impression/route.ts
        click/[token]/route.ts
    admin/
      page.tsx
      login/page.tsx
      campaigns/page.tsx
      creatives/page.tsx
      bookings/page.tsx
  lib/
    ads/
      select-ad.ts
      tokens.ts
      tracking.ts
      validation.ts
    admin/
      auth.ts
  package.json
  next.config.ts
  tsconfig.json

packages/ads-sdk/
  src/
    react/
      AdSlot.tsx
      index.ts
    client.ts
    types.ts
    index.ts
  package.json
  tsconfig.json
```
