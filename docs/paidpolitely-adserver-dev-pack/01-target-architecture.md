# Target Architecture

## Overview

Paid Politely Ads is a first-party ad server for a network of owned sites.

```txt
Consumer Site          Ad Server                  Admin
-------------          ---------                  -----
rdaresgonewild.com --> ads.paidpolitely.com <-- owner dashboard
rprogresspics.com  --> ads.paidpolitely.com
future sites       --> ads.paidpolitely.com
```

## Runtime responsibilities

### Consumer sites

Consumer sites should only:

- declare their `SITE_KEY`
- render ad placements
- call the ad server via `@paidpolitely/ads-sdk`
- display safe ad JSON
- fire impression beacons when visible
- send clicks through adserver redirect URLs

Consumer sites should not:

- query ad campaign tables directly
- know contract values
- choose campaigns themselves
- expose advertiser management logic

### `apps/adserver`

The ad server should:

- receive ad requests by `siteKey` and `placementKey`
- validate the site and placement
- select an active booking
- return safe creative JSON
- create a signed impression token
- receive impression events
- receive click redirect requests
- track clicks
- enforce campaign windows and caps
- return house ads or null when no paid ad is available

### `apps/admin`

The admin app should:

- allow owner-only login initially
- manage sites and placements
- manage advertisers
- manage campaigns
- manage creatives
- manage bookings
- show live campaign status
- show daily stats
- export campaign reports

## Recommended domains

```txt
ads.paidpolitely.com            # public ad API
ads.paidpolitely.com/admin      # admin UI, simplest deployment
```

Alternatively:

```txt
ads.paidpolitely.com            # ad API only
admin.paidpolitely.com          # admin app
```

For MVP, colocating admin under `ads.paidpolitely.com/admin` is simpler.

## Request flow

```txt
1. Consumer site renders <AdSlot placement="homepage_top" />
2. SDK requests GET https://ads.paidpolitely.com/api/v1/ad
3. Adserver selects an eligible booking
4. Adserver returns safe creative JSON + impression token + click URL
5. SDK displays ad with "Sponsored" label
6. SDK uses IntersectionObserver to send impression when visible
7. User clicks ad
8. Browser visits click redirect URL
9. Adserver records click and redirects to advertiser target URL
```

## Selection rules

A booking is eligible when:

- site exists and is active
- placement exists, is active, and belongs to the site
- booking is enabled
- campaign is active/scheduled correctly
- creative is approved
- current time is within booking/campaign dates
- impression/click caps are not exceeded
- adult category and placement compatibility checks pass

Selection order for MVP:

1. Query eligible bookings.
2. Exclude capped bookings.
3. Pick with weighted random by `weight`.
4. If no paid booking is available, optionally return an active house ad.
5. If nothing is available, return `{ ok: true, ad: null }`.

## Caching stance

Do not cache ad selection aggressively in MVP.

For public ad response:

```txt
Cache-Control: no-store
```

Later, caching can be added with short TTLs and cache-busting per placement.

## Privacy stance

MVP should avoid invasive tracking:

- no third-party cookies
- no local storage requirement
- no raw IP storage
- no device fingerprinting
- no cross-site user profiles
- aggregate stats are enough

If IP/user-agent deduplication is needed later, use salted hashes and document it.
