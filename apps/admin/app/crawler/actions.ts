"use server";

import { prisma } from "@rdgw/database";
import { RedditClient, scanSubreddit, syncUser } from "@rdgw/crawler";
import { revalidatePath } from "next/cache";

function getClient(): RedditClient {
  const cookie = process.env.REDDIT_COOKIE ?? "";
  return new RedditClient(cookie, parseInt(process.env.CRAWLER_RPM ?? "25", 10));
}

export async function runSubredditScan(): Promise<{ success: boolean; message: string }> {
  try {
    const client = getClient();
    await scanSubreddit(client);
    revalidatePath("/crawler");
    revalidatePath("/");
    return { success: true, message: "Subreddit scan completed" };
  } catch (e) {
    return { success: false, message: String(e) };
  }
}

export async function runUserSync(username: string, mode: "full" | "incremental"): Promise<{ success: boolean; message: string }> {
  try {
    const client = getClient();
    const result = await syncUser(username, client, mode);
    revalidatePath("/crawler");
    return { success: true, message: `Synced u/${username}: ${result.postsProcessed} posts, ${result.completionsFound} completions` };
  } catch (e) {
    return { success: false, message: String(e) };
  }
}

export async function verifyCompletion(id: string, type: "playbook" | "community", decision: boolean): Promise<void> {
  const now = new Date();
  if (type === "playbook") {
    await prisma.playbookCompletion.update({
      where: { id },
      data: {
        verified: decision,
        verifiedAt: decision ? now : null,
        rejectedAt: decision ? null : now,
      },
    });
  } else {
    await prisma.communityCompletion.update({
      where: { id },
      data: {
        verified: decision,
        verifiedAt: decision ? now : null,
        rejectedAt: decision ? null : now,
      },
    });
  }
  revalidatePath("/completions");
}
