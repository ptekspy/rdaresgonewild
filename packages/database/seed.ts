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

const SITES = [
  {
    key: "rdaresgonewild",
    name: "r/daresgonewild Tracker",
    domain: "rdaresgonewild.com",
  },
  {
    key: "rflashingandflaunting",
    name: "r/FlashingAndFlaunting Board",
    domain: "rflashingandflaunting.com",
  },
  {
    key: "rrealpublicnudity",
    name: "r/RealPublicNudity Board",
    domain: "rrealpublicnudity.com",
  },
  {
    key: "rexhibitionistgirl",
    name: "r/ExhibitionistGirl Board",
    domain: "rexhibitionistgirl.com",
  },
  {
    key: "rchanginginpublic",
    name: "r/ChanginginPublic Board",
    domain: "rchanginginpublic.com",
  },
  {
    key: "rcmnf",
    name: "r/CMNF Board",
    domain: "rcmnf.com",
  },
  {
    key: "ronlyonenaked",
    name: "r/onlyonenaked Board",
    domain: "ronlyonenaked.com",
  },
  {
    key: "routdoorgirls",
    name: "r/outdoorgirls Board",
    domain: "routdoorgirls.com",
  },
  {
    key: "rpermanentnude",
    name: "r/Permanent_Nude Board",
    domain: "rpermanentnude.com",
  },
  {
    key: "rbralessforever",
    name: "r/BralessForever Board",
    domain: "rbralessforever.com",
  },
] as const;

const SITE_SUBREDDITS = [
  { siteKey: "rdaresgonewild", subreddit: "daresgonewild" },
  { siteKey: "rflashingandflaunting", subreddit: "FlashingAndFlaunting" },
  { siteKey: "rrealpublicnudity", subreddit: "RealPublicNudity" },
  { siteKey: "rexhibitionistgirl", subreddit: "ExhibitionistGirl" },
  { siteKey: "rchanginginpublic", subreddit: "ChanginginPublic" },
  { siteKey: "rcmnf", subreddit: "CMNF" },
  { siteKey: "ronlyonenaked", subreddit: "onlyonenaked" },
  { siteKey: "routdoorgirls", subreddit: "outdoorgirls" },
  { siteKey: "rpermanentnude", subreddit: "Permanent_Nude" },
  { siteKey: "rbralessforever", subreddit: "BralessForever" },
] as const;

const IMAGE_HOUSE_ADS = [
  {
    suffix: "image-1",
    asset: "advertise-1.svg",
    headline: "Advertise here",
    body: "Reach a focused Reddit-grown audience.",
  },
  {
    suffix: "image-2",
    asset: "advertise-2.svg",
    headline: "Own this placement",
    body: "Creator tools, platforms, services, and sponsors welcome.",
  },
  {
    suffix: "image-3",
    asset: "advertise-3.svg",
    headline: "Contact us to advertise",
    body: "Simple placements for brands that fit the community.",
  },
] as const;

const TEXT_HOUSE_ADS = [
  {
    suffix: "text-1",
    headline: "Advertise on this site",
    body: "Put your brand in front of a focused Reddit-grown audience. Contact us for rates and placement options.",
    ctaText: "Contact us",
  },
  {
    suffix: "text-2",
    headline: "Sponsor this community board",
    body: "Reach creators and viewers with direct, first-party ad slots across the Paid Politely network.",
    ctaText: "Advertise here",
  },
] as const;

function contactUrlForSite(site: (typeof SITES)[number]) {
  const subject = `Advertising on ${site.domain}`;
  const body = [
    "Hi Paddy,",
    "",
    `I'd like to advertise on ${site.domain}.`,
    "",
    "Company or name:",
    "Website:",
    "Budget or dates:",
    "Preferred placement:",
    "",
    "Thanks!",
  ].join("\r\n");

  return `mailto:coderpaddy+rdgw@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

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

async function upsertCreativeByName(
  campaignId: string,
  name: string,
  data: {
    type: CreativeType;
    imageUrl?: string;
    headline: string;
    body: string;
    ctaText: string;
    targetUrl: string;
    altText: string;
  },
) {
  const existing = await prisma.creative.findFirst({
    where: { campaignId, name },
  });

  const creativeData = {
    ...data,
    status: CreativeStatus.APPROVED,
    category: AdultAdCategory.INTERNAL,
    containsExplicitImage: false,
    requiresAgeGate: true,
    containsExternalTracking: false,
    approvedAt: new Date(),
  };

  if (existing) {
    return prisma.creative.update({
      where: { id: existing.id },
      data: creativeData,
    });
  }

  return prisma.creative.create({
    data: {
      campaignId,
      name,
      ...creativeData,
    },
  });
}

async function upsertSiteHouseCreatives(campaignId: string, site: (typeof SITES)[number]) {
  const targetUrl = contactUrlForSite(site);
  const imageCreatives = IMAGE_HOUSE_ADS.map((ad) =>
    upsertCreativeByName(campaignId, `${site.key}:${ad.suffix}`, {
      type: CreativeType.IMAGE,
      imageUrl: `https://${site.domain}/ads/${site.key}/${ad.asset}`,
      headline: ad.headline,
      body: `${ad.body} ${site.domain}`,
      ctaText: "Contact us",
      targetUrl,
      altText: `${ad.headline} on ${site.name}`,
    }),
  );
  const textCreatives = TEXT_HOUSE_ADS.map((ad) =>
    upsertCreativeByName(campaignId, `${site.key}:${ad.suffix}`, {
      type: CreativeType.TEXT,
      headline: ad.headline,
      body: `${ad.body} Site: ${site.domain}.`,
      ctaText: ad.ctaText,
      targetUrl,
      altText: `${ad.headline} on ${site.name}`,
    }),
  );

  return Promise.all([...imageCreatives, ...textCreatives]);
}

async function main() {
  const seededSites = await Promise.all(
    SITES.map((siteConfig) =>
      prisma.site.upsert({
        where: { key: siteConfig.key },
        update: {
          name: siteConfig.name,
          domain: siteConfig.domain,
          status: SiteStatus.ACTIVE,
        },
        create: {
          key: siteConfig.key,
          name: siteConfig.name,
          domain: siteConfig.domain,
          status: SiteStatus.ACTIVE,
        },
      }),
    ),
  );

  const allPlacements = await Promise.all(
    seededSites.flatMap((site) =>
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
    ),
  );

  const advertiser = await upsertHouseAdvertiser();
  const campaign = await upsertHouseCampaign(advertiser.id);
  const creative = await upsertHouseCreative(campaign.id);
  const siteHouseCreatives = new Map<string, Awaited<ReturnType<typeof upsertSiteHouseCreatives>>>();

  for (const siteConfig of SITES) {
    siteHouseCreatives.set(siteConfig.key, await upsertSiteHouseCreatives(campaign.id, siteConfig));
  }

  await Promise.all(
    SITE_SUBREDDITS.map((mapping) =>
      prisma.siteSubreddit.upsert({
        where: {
          siteKey_subreddit: {
            siteKey: mapping.siteKey,
            subreddit: mapping.subreddit,
          },
        },
        update: { enabled: true },
        create: {
          siteKey: mapping.siteKey,
          subreddit: mapping.subreddit,
          enabled: true,
        },
      }),
    ),
  );

  const homepagePlacements = allPlacements.filter((placement) => placement.key === "homepage_top");
  if (homepagePlacements.length !== seededSites.length) {
    throw new Error("Seed placement homepage_top was not created for every site");
  }

  for (const homepageTop of homepagePlacements) {
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
  }

  for (const site of seededSites) {
    const siteCreatives = siteHouseCreatives.get(site.key) ?? [];
    const sitePlacements = allPlacements.filter((placement) => placement.siteId === site.id);

    for (const placement of sitePlacements) {
      for (const siteCreative of siteCreatives) {
        const existingBooking = await prisma.booking.findFirst({
          where: {
            campaignId: campaign.id,
            creativeId: siteCreative.id,
            placementId: placement.id,
          },
        });

        const data = {
          enabled: true,
          weight: 100,
          priority: 120,
        };

        if (existingBooking) {
          await prisma.booking.update({
            where: { id: existingBooking.id },
            data,
          });
        } else {
          await prisma.booking.create({
            data: {
              campaignId: campaign.id,
              creativeId: siteCreative.id,
              placementId: placement.id,
              ...data,
            },
          });
        }
      }
    }
  }

  console.log(
    `Seeded Paid Politely Ads: ${seededSites.length} sites, ${allPlacements.length} placements, ${SITE_SUBREDDITS.length} subreddit mappings, ${SITES.length * 5} site-specific house creatives.`,
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
