import {
  CampaignStatus,
  CreativeStatus,
  CreativeType,
  prisma,
  SiteStatus,
  type Booking,
  type Campaign,
  type Creative,
  type Placement,
  type Site,
} from "@rdgw/database";

export type BookingWithRelations = Booking & {
  campaign: Campaign;
  creative: Creative;
  placement: Placement & { site: Site };
};

export function pickWeighted<T extends { weight: number }>(items: T[]) {
  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return items[0] ?? null;

  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item;
  }

  return items[items.length - 1] ?? null;
}

function isDateActive(now: Date, startsAt?: Date | null, endsAt?: Date | null) {
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
}

function isCampaignLive(campaign: Campaign, now: Date) {
  if (campaign.status !== CampaignStatus.ACTIVE && campaign.status !== CampaignStatus.SCHEDULED) {
    return false;
  }

  return isDateActive(now, campaign.startsAt, campaign.endsAt);
}

async function isBelowCaps(booking: Booking) {
  const [impressions, clicks] = await Promise.all([
    booking.maxImpressions == null
      ? Promise.resolve(0)
      : prisma.adImpression.count({ where: { bookingId: booking.id } }),
    booking.maxClicks == null ? Promise.resolve(0) : prisma.adClick.count({ where: { bookingId: booking.id } }),
  ]);

  if (booking.maxImpressions != null && impressions >= booking.maxImpressions) return false;
  if (booking.maxClicks != null && clicks >= booking.maxClicks) return false;
  return true;
}

export async function selectAd(siteKey: string, placementKey: string) {
  const site = await prisma.site.findUnique({
    where: { key: siteKey },
    include: {
      placements: {
        where: { key: placementKey },
        take: 1,
      },
    },
  });

  if (!site || site.status !== SiteStatus.ACTIVE) {
    return { ok: false as const, code: "UNKNOWN_SITE" as const, message: "Unknown or inactive site" };
  }

  const placement = site.placements[0];
  if (!placement) {
    return { ok: false as const, code: "UNKNOWN_PLACEMENT" as const, message: "Unknown placement" };
  }

  if (!placement.enabled) {
    return { ok: false as const, code: "PLACEMENT_DISABLED" as const, message: "Placement is disabled" };
  }

  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: {
      placementId: placement.id,
      enabled: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      creative: {
        status: CreativeStatus.APPROVED,
        type: { in: [CreativeType.IMAGE, CreativeType.TEXT, CreativeType.IMAGE_TEXT] },
      },
    },
    include: {
      campaign: true,
      creative: true,
      placement: { include: { site: true } },
    },
    orderBy: [{ priority: "desc" }, { weight: "desc" }],
  });

  const eligible: BookingWithRelations[] = [];
  for (const booking of bookings) {
    if (!isCampaignLive(booking.campaign, now)) continue;
    if (!isDateActive(now, booking.startsAt, booking.endsAt)) continue;
    if (!(await isBelowCaps(booking))) continue;
    eligible.push(booking);
  }

  if (eligible.length === 0) {
    return { ok: true as const, booking: null };
  }

  const highestPriority = eligible[0]?.priority ?? 0;
  const priorityPool = eligible.filter((booking) => booking.priority === highestPriority);
  return { ok: true as const, booking: pickWeighted(priorityPool) };
}
