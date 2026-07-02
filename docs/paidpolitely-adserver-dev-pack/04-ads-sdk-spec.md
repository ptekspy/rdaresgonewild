# `packages/ads-sdk` Spec

Package name:

```txt
@paidpolitely/ads-sdk
```

Purpose:

Reusable ad rendering and tracking package for every consumer site.

## Public API

```tsx
import { AdSlot } from "@paidpolitely/ads-sdk/react";

export function Page() {
  return <AdSlot placement="homepage_top" />;
}
```

## Environment

Consumer app env:

```txt
NEXT_PUBLIC_SITE_KEY=rdaresgonewild
NEXT_PUBLIC_ADS_API_URL=https://ads.paidpolitely.com
```

Server-only optional env:

```txt
ADS_API_SERVER_URL=https://ads.paidpolitely.com
```

## Component props

```ts
export type AdSlotProps = {
  placement: string;
  siteKey?: string;
  className?: string;
  fallback?: React.ReactNode;
  path?: string;
  label?: string;
  reserveSpace?: boolean;
};
```

## Client behaviour

`AdSlot` should:

1. Determine `siteKey` from prop or env.
2. Determine current path from `window.location.pathname` unless passed.
3. Fetch `/api/v1/ad` from the adserver.
4. Render nothing or fallback if no ad.
5. Render a clearly labelled ad if present.
6. Fire `/api/v1/impression` only after the element is actually visible.
7. Send clicks through `ad.clickUrl`.

## Impression tracking

Use `IntersectionObserver`.

MVP counting rule:

- count if at least 50% visible for at least 1000ms

Implementation detail:

```ts
const observer = new IntersectionObserver(
  entries => {
    const entry = entries[0];
    if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
      // start timer, then POST impression
    }
  },
  { threshold: [0, 0.5, 1] },
);
```

Guard against double sends with a `hasTracked` ref.

## Rendering rules

Supported creative types in MVP:

- `IMAGE`
- `TEXT`
- `IMAGE_TEXT`

Do not render arbitrary HTML from public API in MVP.

Example image/text rendering:

```tsx
<a
  href={ad.clickUrl}
  target="_blank"
  rel="sponsored nofollow noopener noreferrer"
  className="pp-ad"
>
  <span className="pp-ad__label">Sponsored</span>
  {ad.imageUrl ? <img src={ad.imageUrl} alt={ad.altText ?? ad.headline ?? "Sponsored ad"} /> : null}
  {ad.headline ? <strong>{ad.headline}</strong> : null}
  {ad.body ? <span>{ad.body}</span> : null}
  {ad.ctaText ? <span>{ad.ctaText}</span> : null}
</a>
```

## Styling

The SDK should ship minimal default CSS or class names only.

Do not force heavy styling. Consumer sites should be able to style via `className`.

Default visual requirements:

- visible label: `Sponsored` or `Ad`
- image respects container width
- no layout shift if `reserveSpace` is true and placement dimensions are known

## Exports

```txt
@paidpolitely/ads-sdk
@paidpolitly/ads-sdk/react
@paidpolitely/ads-sdk/types
```

Example package exports:

```json
{
  "name": "@paidpolitely/ads-sdk",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./react": "./src/react/index.ts",
    "./types": "./src/types.ts"
  },
  "peerDependencies": {
    "react": ">=19"
  }
}
```

## Types

```ts
export type PublicAd = {
  requestId: string;
  impressionToken: string;
  bookingId: string;
  creativeId: string;
  siteKey: string;
  placementKey: string;
  label: "Sponsored" | "Ad";
  type: "IMAGE" | "TEXT" | "IMAGE_TEXT";
  imageUrl?: string;
  headline?: string;
  body?: string;
  ctaText?: string;
  altText?: string;
  clickUrl: string;
  width?: number;
  height?: number;
};

export type GetAdResponse =
  | { ok: true; ad: PublicAd | null }
  | { ok: false; error: { code: string; message: string } };
```
