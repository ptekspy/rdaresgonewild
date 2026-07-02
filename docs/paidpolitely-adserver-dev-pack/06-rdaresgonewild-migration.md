# rdaresgonewild Migration Plan

The existing site should become the first consumer of Paid Politely Ads.

## Target consumer usage

```tsx
import { AdSlot } from "@paidpolitely/ads-sdk/react";

export default function HomePage() {
  return (
    <main>
      <AdSlot placement="homepage_top" />
    </main>
  );
}
```

## Consumer env

In `apps/rdaresgonewild/.env.local` or equivalent:

```txt
NEXT_PUBLIC_SITE_KEY=rdaresgonewild
NEXT_PUBLIC_ADS_API_URL=https://ads.paidpolitely.com
```

Local dev:

```txt
NEXT_PUBLIC_SITE_KEY=rdaresgonewild
NEXT_PUBLIC_ADS_API_URL=http://localhost:3001
```

## Migration steps

### Step 1: Add SDK package

Create:

```txt
packages/ads-sdk
```

Implement basic `AdSlot` client component.

### Step 2: Add adserver app

Create:

```txt
apps/adserver
```

Run locally on port `3001`.

### Step 3: Seed placements

Seed `Site`:

```txt
key: rdaresgonewild
name: r/daresgonewild Tracker
domain: rdaresgonewild.com
```

Seed placements:

```txt
homepage_top
homepage_after_stats
leaderboard_top
leaderboard_between_rows
profile_sidebar
profile_after_progress
dare_picker_top
dare_picker_result
dares_list_top
footer_sponsor
```

### Step 4: Create a house ad

Create an internal advertiser:

```txt
Paid Politely
```

Create campaign:

```txt
House Ads
```

Create creative:

```txt
headline: Advertise here
body: Reach NSFW Reddit creators and viewers across the Paid Politely network.
ctaText: Contact us
imageUrl: optional
targetUrl: https://paidpolitely.com/advertise or mailto replacement page
```

Book it into `rdaresgonewild.homepage_top`.

### Step 5: Replace existing component

Find all imports/usages of the existing local `AdSlot` component.

Replace:

```tsx
<AdSlot slotKey="leaderboard_top" />
```

with:

```tsx
<AdSlot placement="leaderboard_top" />
```

If there are lots of usages, add a temporary compatibility wrapper:

```tsx
import { AdSlot as PaidPolitelyAdSlot } from "@paidpolitely/ads-sdk/react";

export function AdSlot({ slotKey, className }: { slotKey: string; className?: string }) {
  return <PaidPolitelyAdSlot placement={slotKey} className={className} />;
}
```

Then migrate call sites gradually.

### Step 6: Remove direct DB reads from public site ad rendering

Consumer site should no longer call:

```ts
db.adContent.findFirst(...)
```

for rendering ads.

### Step 7: Keep old schema until verified

Keep old `AdSlot` and `AdContent` Prisma models until the new setup is live and stable.

After verification:

- archive old data
- remove old component
- remove old models in a migration

## Acceptance checks

- `rdaresgonewild` homepage renders ad from `ads.paidpolitely.com`.
- If adserver is unavailable, site does not crash.
- If no ad is returned, placement renders nothing or fallback.
- Impression is counted after viewability threshold.
- Click redirects through adserver and records click.
- Public page source does not include contract values or private advertiser notes.
