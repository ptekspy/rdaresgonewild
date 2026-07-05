"use server";

import { prisma } from "@rdgw/database";
import { revalidatePath } from "next/cache";

type QueueClassificationResult = {
  success: boolean;
  message: string;
};

function normalizeUsername(username: string) {
  return username.trim().replace(/^u\//i, "");
}

export async function queueModelClassification(username: string): Promise<QueueClassificationResult> {
  const normalizedUsername = normalizeUsername(username);
  const endpoint = process.env.OLLAMA_CLASSIFIER_ENDPOINT?.replace(/\/$/, "");
  const secret = process.env.OLLAMA_CLASSIFIER_SECRET;

  if (!normalizedUsername) {
    return { success: false, message: "Username is required" };
  }

  if (!endpoint || !secret) {
    return {
      success: false,
      message: "OLLAMA_CLASSIFIER_ENDPOINT and OLLAMA_CLASSIFIER_SECRET are required",
    };
  }

  const userExists = await prisma.dgwUser.findUnique({
    where: { username: normalizedUsername },
    select: { username: true },
  });

  if (!userExists) {
    return { success: false, message: `u/${normalizedUsername} was not found` };
  }

  const now = new Date();
  const job = await prisma.dgwUserClassification.upsert({
    where: { username: normalizedUsername },
    create: {
      username: normalizedUsername,
      status: "QUEUED",
      requestedAt: now,
      error: null,
      failedAt: null,
    },
    update: {
      status: "QUEUED",
      requestedAt: now,
      error: null,
      failedAt: null,
    },
  });

  try {
    const response = await fetch(`${endpoint}/v1/rdgw/classify-user`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        jobId: job.id,
        username: normalizedUsername,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      await prisma.dgwUserClassification.update({
        where: { username: normalizedUsername },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          error: `Classifier rejected job: ${response.status} ${body}`.slice(0, 1000),
        },
      });

      revalidatePath("/users");
      return { success: false, message: `Classifier rejected u/${normalizedUsername}` };
    }

    revalidatePath("/users");
    return { success: true, message: `Queued classification for u/${normalizedUsername}` };
  } catch (error) {
    await prisma.dgwUserClassification.update({
      where: { username: normalizedUsername },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        error: String(error).slice(0, 1000),
      },
    });

    revalidatePath("/users");
    return { success: false, message: `Could not contact classifier for u/${normalizedUsername}` };
  }
}
