import { type NextRequest } from "next/server";

import { claimNextExtensionTask } from "@/lib/extension-scheduler";
import { jsonError, jsonResponse, optionsResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClaimRequestBody {
  forceMainQueue?: unknown;
  forceCoreBootstrap?: unknown;
}

export function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  return claimTask();
}

export async function POST(request: NextRequest) {
  let body: ClaimRequestBody = {};

  try {
    body = (await request.json()) as ClaimRequestBody;
  } catch {
    // Empty bodies are fine; default to normal scheduling.
  }

  return claimTask({
    forceMainQueue: body.forceMainQueue === true || body.forceCoreBootstrap === true,
  });
}

async function claimTask(options: { forceMainQueue?: boolean } = {}) {
  try {
    const task = await claimNextExtensionTask(options);

    if (!task) {
      return jsonResponse({ task: null, idle: true, retryAfterMs: 30_000 });
    }

    return jsonResponse({ task, idle: false });
  } catch (error) {
    console.error("Failed to claim extension task", error);
    return jsonError("Failed to claim extension task", 500);
  }
}
