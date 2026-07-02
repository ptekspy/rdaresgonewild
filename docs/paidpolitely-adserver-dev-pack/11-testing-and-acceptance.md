# Testing and Acceptance Criteria

## Unit tests

Add tests for:

- active booking filtering
- date window filtering
- campaign status filtering
- weighted random selection
- cap exclusion
- token signing and verification
- expired token rejection
- URL validation
- duplicate impression prevention

## Integration tests

Adserver API:

- unknown site returns structured error
- unknown placement returns structured error
- placement with no ad returns `ad: null`
- active booking returns safe ad JSON
- ad JSON does not include private fields
- impression endpoint writes record once
- click endpoint writes record and redirects
- click endpoint rejects tampered token

SDK:

- renders no-ad response without crash
- renders image ad
- includes sponsored label
- includes safe rel attributes
- sends impression once
- does not send impression before visibility threshold

Admin:

- unauthenticated admin page redirects to login
- valid admin login creates session
- create advertiser
- create campaign
- create creative
- create booking
- pause booking

## Manual acceptance script

### Owner creates first private ad

1. Login to `/admin`.
2. Create advertiser `Test Advertiser`.
3. Create campaign `July test campaign`.
4. Create creative with:

```txt
headline: Test Sponsor
body: This is a test network ad.
ctaText: Visit
imageUrl: https://example.com/test.png
targetUrl: https://example.com
```

5. Approve creative.
6. Book into:

```txt
site: rdaresgonewild
placement: homepage_top
```

7. Visit `rdaresgonewild` local site.
8. Confirm ad renders.
9. Scroll until visible.
10. Confirm impression count increases.
11. Click ad.
12. Confirm click count increases and redirects.

## Production acceptance

Before considering production ready:

- adserver deployed to `ads.paidpolitely.com`
- TLS active
- admin protected
- CORS allows real site domains
- `rdaresgonewild.com` renders production ad
- adserver outage does not break consumer site
- logs contain no secrets
- no raw IP storage unless explicitly implemented with hashing
- all paid links labelled and use sponsored rel
- campaign report export works
