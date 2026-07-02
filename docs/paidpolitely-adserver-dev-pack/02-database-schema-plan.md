# Database Schema Plan

Use the existing `packages/database/prisma/schema.prisma` as the base.

The current app-specific Reddit models can stay in the same DB package for now, but ad models should be network-wide and not tied to `rdaresgonewild`.

## Prisma model sketch

Add or replace the current ad models with the following.

```prisma
// ─── Paid Politely Ads ───────────────────────────────────────────────────────

enum SiteStatus {
  ACTIVE
  PAUSED
  ARCHIVED
}

enum AdvertiserStatus {
  ACTIVE
  PAUSED
  BLOCKED
  ARCHIVED
}

enum CampaignStatus {
  DRAFT
  SCHEDULED
  ACTIVE
  PAUSED
  ENDED
  ARCHIVED
}

enum PricingModel {
  FLAT
  CPM
  CPC
  HYBRID
  MANUAL
}

enum CreativeType {
  IMAGE
  TEXT
  IMAGE_TEXT
  OWNER_HTML
}

enum CreativeStatus {
  DRAFT
  PENDING_REVIEW
  APPROVED
  REJECTED
  ARCHIVED
}

enum AdultAdCategory {
  ADULT_CREATOR
  ADULT_PLATFORM
  TOY_BRAND
  DATING
  COMMUNITY
  INTERNAL
  OTHER
}

model Site {
  id          String     @id @default(cuid())
  key         String     @unique
  name        String
  domain      String?
  status      SiteStatus @default(ACTIVE)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  placements  Placement[]
  impressions AdImpression[]
  clicks      AdClick[]

  @@index([status])
}

model Placement {
  id          String   @id @default(cuid())
  siteId      String
  site        Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  key         String
  label       String
  description String?
  width       Int?
  height      Int?
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  bookings    Booking[]
  impressions AdImpression[]
  clicks      AdClick[]

  @@unique([siteId, key])
  @@index([enabled])
}

model Advertiser {
  id           String           @id @default(cuid())
  name         String
  contactName  String?
  contactEmail String?
  websiteUrl   String?
  status       AdvertiserStatus @default(ACTIVE)
  notes        String?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  campaigns    Campaign[]

  @@index([status])
}

model Campaign {
  id            String         @id @default(cuid())
  advertiserId  String
  advertiser    Advertiser     @relation(fields: [advertiserId], references: [id], onDelete: Cascade)
  name          String
  status        CampaignStatus @default(DRAFT)
  startsAt      DateTime?
  endsAt        DateTime?
  contractValue Decimal?       @db.Decimal(10, 2)
  currency      String         @default("GBP")
  pricingModel  PricingModel   @default(FLAT)
  notes         String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  creatives     Creative[]
  bookings      Booking[]

  @@index([advertiserId])
  @@index([status, startsAt, endsAt])
}

model Creative {
  id                      String         @id @default(cuid())
  campaignId              String
  campaign                Campaign       @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  name                    String
  type                    CreativeType   @default(IMAGE)
  status                  CreativeStatus @default(DRAFT)
  category                AdultAdCategory @default(OTHER)

  imageUrl                String?
  headline                String?
  body                    String?
  ctaText                 String?
  targetUrl               String
  altText                 String?

  // Owner-only. Do not expose this to advertiser self-serve in MVP.
  htmlSnippet             String?

  containsExplicitImage   Boolean        @default(false)
  requiresAgeGate         Boolean        @default(true)
  containsExternalTracking Boolean       @default(false)

  rejectionReason         String?
  approvedAt              DateTime?
  createdAt               DateTime       @default(now())
  updatedAt               DateTime       @updatedAt

  bookings                Booking[]
  impressions             AdImpression[]
  clicks                  AdClick[]

  @@index([campaignId])
  @@index([status])
  @@index([category])
}

model Booking {
  id             String    @id @default(cuid())
  campaignId     String
  campaign       Campaign  @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  creativeId     String
  creative       Creative  @relation(fields: [creativeId], references: [id], onDelete: Cascade)
  placementId    String
  placement      Placement @relation(fields: [placementId], references: [id], onDelete: Cascade)

  enabled        Boolean   @default(true)
  startsAt       DateTime?
  endsAt         DateTime?
  weight         Int       @default(100)
  priority       Int       @default(0)
  maxImpressions Int?
  maxClicks      Int?

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  impressions    AdImpression[]
  clicks         AdClick[]

  @@index([placementId, enabled, startsAt, endsAt])
  @@index([campaignId])
  @@index([creativeId])
}

model AdImpression {
  id           String    @id @default(cuid())
  bookingId    String
  booking      Booking   @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  creativeId   String
  creative     Creative  @relation(fields: [creativeId], references: [id], onDelete: Cascade)
  placementId  String
  placement    Placement @relation(fields: [placementId], references: [id], onDelete: Cascade)
  siteId       String
  site         Site      @relation(fields: [siteId], references: [id], onDelete: Cascade)

  path         String?
  referrer     String?
  userAgentHash String?
  ipHash       String?
  tokenHash    String?   @unique
  createdAt    DateTime  @default(now())

  @@index([bookingId, createdAt])
  @@index([creativeId, createdAt])
  @@index([placementId, createdAt])
  @@index([siteId, createdAt])
}

model AdClick {
  id           String    @id @default(cuid())
  bookingId    String
  booking      Booking   @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  creativeId   String
  creative     Creative  @relation(fields: [creativeId], references: [id], onDelete: Cascade)
  placementId  String
  placement    Placement @relation(fields: [placementId], references: [id], onDelete: Cascade)
  siteId       String
  site         Site      @relation(fields: [siteId], references: [id], onDelete: Cascade)

  impressionId String?
  path         String?
  referrer     String?
  targetUrl    String
  userAgentHash String?
  ipHash       String?
  createdAt    DateTime  @default(now())

  @@index([bookingId, createdAt])
  @@index([creativeId, createdAt])
  @@index([placementId, createdAt])
  @@index([siteId, createdAt])
}

model DailyAdStats {
  id          String   @id @default(cuid())
  date        DateTime
  siteId      String
  placementId String
  campaignId  String
  creativeId  String
  bookingId   String
  impressions Int      @default(0)
  clicks      Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([date, siteId, placementId, campaignId, creativeId, bookingId])
  @@index([date])
  @@index([campaignId, date])
}
```

## Migration note

For MVP, do not destroy existing `AdSlot` and `AdContent` until the new system is working.

Safer path:

1. Add new models alongside old models.
2. Seed `Site` and `Placement` records matching existing slot keys.
3. Build adserver against new models.
4. Replace consumer rendering.
5. Remove old models only after production has run successfully.

## Seed data

Create `packages/database/prisma/seed.ts` or equivalent.

Initial sites:

```ts
const sites = [
  {
    key: "rdaresgonewild",
    name: "r/daresgonewild Tracker",
    domain: "rdaresgonewild.com",
  },
  {
    key: "rprogresspics",
    name: "r/progresspics Tracker",
    domain: "rprogresspics.com",
  },
];
```

Initial placements for `rdaresgonewild`:

```ts
const placements = [
  "homepage_top",
  "homepage_after_stats",
  "leaderboard_top",
  "leaderboard_between_rows",
  "profile_sidebar",
  "profile_after_progress",
  "dare_picker_top",
  "dare_picker_result",
  "dares_list_top",
  "footer_sponsor",
];
```
