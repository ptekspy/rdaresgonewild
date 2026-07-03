"use server";

import { Prisma, prisma } from "@rdgw/database";
import { PLAYBOOK_BY_SLUG } from "@rdgw/playbook";
import { revalidatePath } from "next/cache";

type CompletionType = "playbook" | "community";

function normaliseUsername(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .trim()
    .replace(/^u\//i, "")
    .replace(/^@/, "");
}

function revalidateDareReview() {
  revalidatePath("/");
  revalidatePath("/dares");
  revalidatePath("/completions");
}

async function upsertCommunityCompletion(
  tx: Prisma.TransactionClient,
  completion: { username: string; postId: string; detectedAt: Date },
  darerUsername: string,
) {
  await tx.communityCompletion.upsert({
    where: {
      username_postId: {
        username: completion.username,
        postId: completion.postId,
      },
    },
    create: {
      username: completion.username,
      postId: completion.postId,
      darerUsername,
      detectedAt: completion.detectedAt,
      verified: null,
      verifiedAt: null,
      rejectedAt: null,
    },
    update: {
      darerUsername,
      detectedAt: completion.detectedAt,
      verified: null,
      verifiedAt: null,
      rejectedAt: null,
    },
  });
}

async function upsertPlaybookCompletion(
  tx: Prisma.TransactionClient,
  completion: { username: string; postId: string; detectedAt: Date },
  dareSlug: string,
) {
  await tx.playbookCompletion.upsert({
    where: {
      username_dareSlug: {
        username: completion.username,
        dareSlug,
      },
    },
    create: {
      username: completion.username,
      postId: completion.postId,
      dareSlug,
      detectedAt: completion.detectedAt,
      confidence: 1,
      verified: null,
      verifiedAt: null,
      rejectedAt: null,
    },
    update: {
      postId: completion.postId,
      detectedAt: completion.detectedAt,
      confidence: 1,
      verified: null,
      verifiedAt: null,
      rejectedAt: null,
    },
  });
}

export async function verifyDare(id: string, type: CompletionType, decision: boolean): Promise<void> {
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

  revalidateDareReview();
}

export async function reclassifyDare(id: string, fromType: CompletionType, formData: FormData): Promise<void> {
  const targetType = String(formData.get("targetType"));
  const dareSlug = String(formData.get("dareSlug") ?? "");
  const darerUsername = normaliseUsername(formData.get("darerUsername")) || "unknown";

  if (targetType !== "playbook" && targetType !== "community") {
    throw new Error("Choose whether this dare is playbook or community.");
  }

  if (targetType === "playbook" && !PLAYBOOK_BY_SLUG.has(dareSlug)) {
    throw new Error("Choose a valid playbook dare.");
  }

  await prisma.$transaction(async (tx) => {
    if (fromType === "playbook") {
      const completion = await tx.playbookCompletion.findUniqueOrThrow({
        where: { id },
        select: { id: true, username: true, postId: true, dareSlug: true, detectedAt: true },
      });

      if (targetType === "playbook") {
        if (completion.dareSlug === dareSlug) {
          await tx.playbookCompletion.update({
            where: { id },
            data: { verified: null, verifiedAt: null, rejectedAt: null },
          });
          return;
        }

        await upsertPlaybookCompletion(tx, completion, dareSlug);
        await tx.playbookCompletion.delete({ where: { id } });
        return;
      }

      await upsertCommunityCompletion(tx, completion, darerUsername);
      await tx.playbookCompletion.delete({ where: { id } });
      return;
    }

    const completion = await tx.communityCompletion.findUniqueOrThrow({
      where: { id },
      select: { id: true, username: true, postId: true, darerUsername: true, detectedAt: true },
    });

    if (targetType === "community") {
      await tx.communityCompletion.update({
        where: { id },
        data: {
          darerUsername,
          verified: null,
          verifiedAt: null,
          rejectedAt: null,
        },
      });
      return;
    }

    await upsertPlaybookCompletion(tx, completion, dareSlug);
    await tx.communityCompletion.delete({ where: { id } });
  });

  revalidateDareReview();
}
