"use server";

import {
  AdultAdCategory,
  CampaignStatus,
  CreativeStatus,
  CreativeType,
  PricingModel,
  Prisma,
  prisma,
} from "@rdgw/database";
import { revalidatePath } from "next/cache";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(formData: FormData, key: string) {
  const value = readString(formData, key);
  return value || null;
}

function optionalDate(formData: FormData, key: string) {
  const value = readString(formData, key);
  return value ? new Date(value) : null;
}

function optionalInt(formData: FormData, key: string) {
  const value = readString(formData, key);
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertSafeTargetUrl(value: string) {
  const url = new URL(value);
  if (url.protocol === "https:") return url.toString();
  if (url.protocol === "mailto:") return url.toString();
  throw new Error("Target URL must use HTTPS or mailto.");
}

function assertHttpsUrl(value: string | null) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Image URL must use HTTPS.");
  }
  return url.toString();
}

function enumValue<T extends Record<string, string>>(record: T, value: string, fallback: T[keyof T]) {
  return Object.values(record).includes(value) ? (value as T[keyof T]) : fallback;
}

export async function createAdPackage(formData: FormData) {
  const advertiserName = readString(formData, "advertiserName");
  const campaignName = readString(formData, "campaignName");
  const creativeName = readString(formData, "creativeName");
  const targetUrl = assertSafeTargetUrl(readString(formData, "targetUrl"));
  const placementId = readString(formData, "placementId");

  if (!advertiserName || !campaignName || !creativeName || !targetUrl || !placementId) {
    throw new Error("Advertiser, campaign, creative, target URL, and placement are required.");
  }

  const imageUrl = assertHttpsUrl(optionalString(formData, "imageUrl"));
  const headline = optionalString(formData, "headline");
  const body = optionalString(formData, "body");
  const type = imageUrl && (headline || body) ? CreativeType.IMAGE_TEXT : imageUrl ? CreativeType.IMAGE : CreativeType.TEXT;
  const approveNow = formData.get("approveNow") === "on";
  const activateNow = formData.get("activateNow") === "on";
  const campaignStatus = enumValue(
    CampaignStatus,
    readString(formData, "campaignStatus"),
    activateNow ? CampaignStatus.ACTIVE : CampaignStatus.DRAFT,
  );

  await prisma.$transaction(async (tx) => {
    const advertiser =
      (await tx.advertiser.findFirst({
        where: { name: { equals: advertiserName, mode: "insensitive" } },
      })) ??
      (await tx.advertiser.create({
        data: {
          name: advertiserName,
          contactName: optionalString(formData, "contactName"),
          contactEmail: optionalString(formData, "contactEmail"),
          websiteUrl: optionalString(formData, "websiteUrl"),
          notes: optionalString(formData, "advertiserNotes"),
        },
      }));

    const campaign = await tx.campaign.create({
      data: {
        advertiserId: advertiser.id,
        name: campaignName,
        status: campaignStatus,
        startsAt: optionalDate(formData, "campaignStartsAt"),
        endsAt: optionalDate(formData, "campaignEndsAt"),
        contractValue: optionalString(formData, "contractValue") as Prisma.Decimal | string | null,
        currency: readString(formData, "currency") || "GBP",
        pricingModel: enumValue(PricingModel, readString(formData, "pricingModel"), PricingModel.FLAT),
        notes: optionalString(formData, "campaignNotes"),
      },
    });

    const creative = await tx.creative.create({
      data: {
        campaignId: campaign.id,
        name: creativeName,
        type,
        status: approveNow ? CreativeStatus.APPROVED : CreativeStatus.DRAFT,
        category: enumValue(AdultAdCategory, readString(formData, "category"), AdultAdCategory.OTHER),
        imageUrl,
        headline,
        body,
        ctaText: optionalString(formData, "ctaText"),
        targetUrl,
        altText: optionalString(formData, "altText"),
        containsExplicitImage: formData.get("containsExplicitImage") === "on",
        requiresAgeGate: formData.get("requiresAgeGate") !== "off",
        containsExternalTracking: formData.get("containsExternalTracking") === "on",
        approvedAt: approveNow ? new Date() : null,
      },
    });

    await tx.booking.create({
      data: {
        campaignId: campaign.id,
        creativeId: creative.id,
        placementId,
        enabled: formData.get("bookingEnabled") !== "off",
        startsAt: optionalDate(formData, "bookingStartsAt"),
        endsAt: optionalDate(formData, "bookingEndsAt"),
        weight: optionalInt(formData, "weight") ?? 100,
        priority: optionalInt(formData, "priority") ?? 0,
        maxImpressions: optionalInt(formData, "maxImpressions"),
        maxClicks: optionalInt(formData, "maxClicks"),
      },
    });
  });

  revalidatePath("/ads");
  revalidatePath("/");
}

export async function toggleBooking(id: string, enabled: boolean) {
  await prisma.booking.update({
    where: { id },
    data: { enabled },
  });

  revalidatePath("/ads");
  revalidatePath("/");
}

export async function approveCreative(id: string) {
  await prisma.creative.update({
    where: { id },
    data: {
      status: CreativeStatus.APPROVED,
      approvedAt: new Date(),
    },
  });

  revalidatePath("/ads");
}
