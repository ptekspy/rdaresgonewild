# Ad Server API Spec

Base URL:

```txt
https://ads.paidpolitely.com
```

API namespace:

```txt
/api/v1
```

## Public endpoints

### `GET /api/v1/ad`

Returns one ad for a site placement.

Query params:

```ts
type GetAdQuery = {
  site: string;       // e.g. rdaresgonewild
  placement: string;  // e.g. homepage_top
  path?: string;      // current page path
  url?: string;       // optional full URL
  ref?: string;       // optional referrer
};
```

Success response with ad:

```ts
type AdResponse = {
  ok: true;
  ad: {
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
};
```

Success response without ad:

```ts
type NoAdResponse = {
  ok: true;
  ad: null;
};
```

Invalid request:

```ts
type ErrorResponse = {
  ok: false;
  error: {
    code: "BAD_REQUEST" | "UNKNOWN_SITE" | "UNKNOWN_PLACEMENT" | "PLACEMENT_DISABLED";
    message: string;
  };
};
```

Rules:

- Must not return private advertiser contact info.
- Must not return contract values.
- Must not return raw `targetUrl`; return only `clickUrl`.
- Must not return owner-only HTML unless explicitly enabled and safe.
- `Cache-Control: no-store` for MVP.

Example:

```txt
GET /api/v1/ad?site=rdaresgonewild&placement=homepage_top&path=/
```

### `POST /api/v1/impression`

Records a viewable impression.

Request:

```ts
type ImpressionRequest = {
  impressionToken: string;
  visibleMs?: number;
  path?: string;
};
```

Response:

```ts
type ImpressionResponse = {
  ok: true;
};
```

Rules:

- Impression should be idempotent by token.
- Only count once per generated impression token.
- Token should be signed and expire.
- Recommended validity: 30 minutes.
- Do not require cookies.

### `GET /api/v1/click/:token`

Records a click and redirects to the creative target URL.

Rules:

- Token should be signed.
- Token should include booking ID, creative ID, placement ID, site ID, issued timestamp, and target URL hash.
- Validate target URL from DB before redirecting.
- Redirect with HTTP 302 or 303.
- Do not redirect to unsupported protocols. Only allow `https://` in MVP.

The SDK should render anchors using this URL:

```tsx
<a href={ad.clickUrl} rel="sponsored nofollow noopener noreferrer" target="_blank">
```

## Admin endpoints

Admin can be implemented as server actions, route handlers, or API endpoints.

All admin routes require owner auth.

Recommended route group:

```txt
/admin
/api/admin/*
```

Endpoints to implement if using APIs:

```txt
GET    /api/admin/sites
POST   /api/admin/sites
PATCH  /api/admin/sites/:id

GET    /api/admin/placements
POST   /api/admin/placements
PATCH  /api/admin/placements/:id

GET    /api/admin/advertisers
POST   /api/admin/advertisers
PATCH  /api/admin/advertisers/:id

GET    /api/admin/campaigns
POST   /api/admin/campaigns
PATCH  /api/admin/campaigns/:id

GET    /api/admin/creatives
POST   /api/admin/creatives
PATCH  /api/admin/creatives/:id

GET    /api/admin/bookings
POST   /api/admin/bookings
PATCH  /api/admin/bookings/:id

GET    /api/admin/reports/campaign/:id
GET    /api/admin/reports/campaign/:id.csv
```

## CORS

Allow ad requests from configured site domains only.

Env:

```txt
ADS_ALLOWED_ORIGINS=https://rdaresgonewild.com,https://www.rdaresgonewild.com,https://rprogresspics.com
```

For local dev:

```txt
http://localhost:6789,http://localhost:3000,http://localhost:3001
```

If a consumer site is server-rendering the request, origin may be absent. Validate `site` and placement regardless.

## Security headers

Adserver should set:

```txt
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

Admin should additionally use a strict CSP.
