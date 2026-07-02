# Admin App Spec

The admin app is for the owner to manage private ad contracts.

MVP auth should be simple but not careless.

Recommended MVP:

- `ADMIN_SECRET` password
- signed HTTP-only session cookie
- optional basic auth at hosting/proxy level
- no public registration

## Route structure

If colocated in `apps/adserver`:

```txt
/admin
/admin/login
/admin/sites
/admin/placements
/admin/advertisers
/admin/campaigns
/admin/creatives
/admin/bookings
/admin/reports
```

If separate `apps/admin`, use same internal routes.

## Dashboard homepage

Show:

- active campaigns
- campaigns ending soon
- bookings with no impressions today
- top placements by impressions
- top campaigns by clicks
- creatives pending approval

## Sites page

Fields:

- name
- key
- domain
- status

Actions:

- create site
- pause site
- edit domain

## Placements page

Fields:

- site
- key
- label
- description
- width
- height
- enabled

Actions:

- create placement
- disable placement
- copy SDK snippet

Example snippet shown in admin:

```tsx
<AdSlot placement="homepage_top" />
```

## Advertisers page

Fields:

- name
- contact name
- contact email
- website URL
- status
- notes

Actions:

- create advertiser
- pause advertiser
- view campaigns

## Campaigns page

Fields:

- advertiser
- campaign name
- status
- startsAt
- endsAt
- pricing model
- contract value
- currency
- notes

Actions:

- create campaign
- pause campaign
- mark ended
- duplicate campaign
- view report

Status helper:

A campaign can be `SCHEDULED` before start date, `ACTIVE` during the date window, and `ENDED` after end date. Do not rely only on stored status; derive live state in UI.

## Creatives page

Fields:

- campaign
- name
- type
- category
- image URL
- headline
- body
- CTA
- target URL
- alt text
- status
- moderation flags

Actions:

- preview creative
- approve creative
- reject creative
- archive creative

Validation:

- target URL must be HTTPS
- image URL must be HTTPS
- headline/body length limits
- no underage-coded terms
- no illegal/non-consensual framing
- no advertiser JS

## Bookings page

Fields:

- campaign
- creative
- site
- placement
- startsAt
- endsAt
- enabled
- weight
- priority
- max impressions
- max clicks

Actions:

- create booking
- pause booking
- duplicate booking
- view placement report

## Reports page

Campaign report should show:

- date range
- impressions
- clicks
- CTR
- by day table
- by placement table
- by creative table
- CSV export

## MVP forms

Use plain server actions or route handlers. Do not spend time introducing a full form framework unless already used.

Use Zod for input validation if available/acceptable.

## Owner-friendly workflow

The admin should support this complete flow:

```txt
1. Create advertiser.
2. Create campaign.
3. Add image/text creative.
4. Approve creative.
5. Book creative into one or more placements.
6. Confirm it appears on consumer site.
7. View impressions/clicks.
8. Export simple report for advertiser.
```
