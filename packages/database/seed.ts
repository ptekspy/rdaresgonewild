import {
  AdvertiserStatus,
  AdultAdCategory,
  CampaignStatus,
  CreativeStatus,
  CreativeType,
  PricingModel,
  SiteStatus,
  prisma,
} from "./src/index";

const HOUSE_AD_TARGET_URL =
  "mailto:coderpaddy+rdgw@gmail.com" +
  "?subject=Advertising%20on%20rdaresgonewild" +
  "&body=Hi%20Paddy%2C%0D%0A%0D%0AI%27d%20like%20to%20advertise%20on%20rdaresgonewild.%0D%0A%0D%0ACompany%20or%20name%3A%0D%0AWebsite%3A%0D%0ABudget%20or%20dates%3A%0D%0A%0D%0AThanks!";
const HOUSE_AD_IMAGE_URL = "https://rdaresgonewild.com/ads/Advertise_Here_555x125.png";

const RDGW_PLACEMENTS = [
  { key: "homepage_top", label: "Homepage top", width: 970, height: 250 },
  { key: "homepage_after_stats", label: "Homepage after stats", width: 970, height: 250 },
  { key: "leaderboard_top", label: "Leaderboard top", width: 970, height: 250 },
  { key: "leaderboard_between_rows", label: "Leaderboard between rows", width: 728, height: 90 },
  { key: "profile_sidebar", label: "Profile sidebar", width: 300, height: 250 },
  { key: "profile_after_progress", label: "Profile after progress", width: 728, height: 90 },
  { key: "dare_picker_top", label: "Dare picker top", width: 970, height: 250 },
  { key: "dare_picker_result", label: "Dare picker result", width: 728, height: 90 },
  { key: "dares_list_top", label: "Dares list top", width: 970, height: 250 },
  { key: "footer_sponsor", label: "Footer sponsor", width: 970, height: 90 },
] as const;

async function upsertHouseAdvertiser() {
  const existing = await prisma.advertiser.findFirst({
    where: { name: "Paid Politely" },
  });

  if (existing) {
    return prisma.advertiser.update({
      where: { id: existing.id },
      data: {
        status: AdvertiserStatus.ACTIVE,
        websiteUrl: "https://paidpolitely.com",
        notes: "Internal house advertiser for Paid Politely Ads.",
      },
    });
  }

  return prisma.advertiser.create({
    data: {
      name: "Paid Politely",
      status: AdvertiserStatus.ACTIVE,
      websiteUrl: "https://paidpolitely.com",
      notes: "Internal house advertiser for Paid Politely Ads.",
    },
  });
}

async function upsertHouseCampaign(advertiserId: string) {
  const existing = await prisma.campaign.findFirst({
    where: { advertiserId, name: "House Ads" },
  });

  const data = {
    status: CampaignStatus.ACTIVE,
    pricingModel: PricingModel.MANUAL,
    currency: "GBP",
    notes: "Default internal campaign used when a paid sponsor is not configured.",
  };

  if (existing) {
    return prisma.campaign.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.campaign.create({
    data: {
      advertiserId,
      name: "House Ads",
      ...data,
    },
  });
}

async function upsertHouseCreative(campaignId: string) {
  const existing = await prisma.creative.findFirst({
    where: { campaignId, name: "Advertise here" },
  });

  const data = {
    type: CreativeType.IMAGE,
    status: CreativeStatus.APPROVED,
    category: AdultAdCategory.INTERNAL,
    imageUrl: HOUSE_AD_IMAGE_URL,
    headline: "Advertise here",
    body: "Reach NSFW Reddit creators and viewers across the Paid Politely network.",
    ctaText: "Contact us",
    targetUrl: HOUSE_AD_TARGET_URL,
    altText: "Advertise with Paid Politely",
    containsExplicitImage: false,
    requiresAgeGate: true,
    containsExternalTracking: false,
    approvedAt: new Date(),
  };

  if (existing) {
    return prisma.creative.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.creative.create({
    data: {
      campaignId,
      name: "Advertise here",
      ...data,
    },
  });
}

async function main() {
  const site = await prisma.site.upsert({
    where: { key: "rdaresgonewild" },
    update: {
      name: "r/daresgonewild Tracker",
      domain: "rdaresgonewild.com",
      status: SiteStatus.ACTIVE,
    },
    create: {
      key: "rdaresgonewild",
      name: "r/daresgonewild Tracker",
      domain: "rdaresgonewild.com",
      status: SiteStatus.ACTIVE,
    },
  });

  const placements = await Promise.all(
    RDGW_PLACEMENTS.map((placement) =>
      prisma.placement.upsert({
        where: { siteId_key: { siteId: site.id, key: placement.key } },
        update: {
          label: placement.label,
          width: placement.width,
          height: placement.height,
          enabled: true,
        },
        create: {
          siteId: site.id,
          key: placement.key,
          label: placement.label,
          width: placement.width,
          height: placement.height,
          enabled: true,
        },
      }),
    ),
  );

  const homepageTop = placements.find((placement) => placement.key === "homepage_top");
  if (!homepageTop) {
    throw new Error("Seed placement homepage_top was not created");
  }

  const advertiser = await upsertHouseAdvertiser();
  const campaign = await upsertHouseCampaign(advertiser.id);
  const creative = await upsertHouseCreative(campaign.id);

  const existingBooking = await prisma.booking.findFirst({
    where: {
      campaignId: campaign.id,
      creativeId: creative.id,
      placementId: homepageTop.id,
    },
  });

  if (existingBooking) {
    await prisma.booking.update({
      where: { id: existingBooking.id },
      data: {
        enabled: true,
        weight: 100,
        priority: 100,
      },
    });
  } else {
    await prisma.booking.create({
      data: {
        campaignId: campaign.id,
        creativeId: creative.id,
        placementId: homepageTop.id,
        enabled: true,
        weight: 100,
        priority: 100,
      },
    });
  }

  console.log(
    `Seeded Paid Politely Ads: ${site.key}, ${placements.length} placements, house ad on homepage_top.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
