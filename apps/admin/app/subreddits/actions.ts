"use server";

import { prisma } from "@rdgw/database";
import { revalidatePath } from "next/cache";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normaliseKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export async function saveSiteSubreddit(formData: FormData) {
  const siteKey = normaliseKey(readString(formData, "siteKey"));
  const siteName = readString(formData, "siteName");
  const domain = readString(formData, "domain");
  const subreddit = readString(formData, "subreddit").replace(/^r\//i, "");
  const enabled = formData.get("enabled") === "on";

  if (!siteKey || !siteName || !subreddit) {
    throw new Error("Site key, site name, and subreddit are required.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.site.upsert({
      where: { key: siteKey },
      update: {
        name: siteName,
        domain: domain || null,
      },
      create: {
        key: siteKey,
        name: siteName,
        domain: domain || null,
      },
    });

    await tx.siteSubreddit.upsert({
      where: { siteKey_subreddit: { siteKey, subreddit } },
      update: { enabled },
      create: { siteKey, subreddit, enabled },
    });
  });

  revalidatePath("/subreddits");
  revalidatePath("/");
}

export async function toggleSiteSubreddit(id: string, enabled: boolean) {
  await prisma.siteSubreddit.update({
    where: { id },
    data: { enabled },
  });

  revalidatePath("/subreddits");
}
