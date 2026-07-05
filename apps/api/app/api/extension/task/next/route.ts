import { type NextRequest } from "next/server";

import { claimNextExtensionTask } from "@/lib/extension-scheduler";
import { jsonError, jsonResponse, optionsResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  return claimTask();
}

export async function POST(_request: NextRequest) {
  return claimTask();
}

async function claimTask() {
  try {
    const task = await claimNextExtensionTask();

    if (!task) {
      return jsonResponse({ task: null, idle: true, retryAfterMs: 30_000 });
    }

    return jsonResponse({ task, idle: false });
  } catch (error) {
    console.error("Failed to claim extension task", error);
    return jsonError("Failed to claim extension task", 500);
  }
}
