import { type NextRequest } from "next/server";

import { completeExtensionTask } from "@/lib/extension-scheduler";
import { flushExtensionJsonBuffer } from "@/lib/extension-json-buffer";
import { jsonError, jsonResponse, optionsResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = await request.json();
    const stopped = typeof body === "object" && body !== null && "stopped" in body && body.stopped === true;
    await flushExtensionJsonBuffer(id, stopped ? "task-stopped" : "task-complete");
    const result = await completeExtensionTask(id, body);
    return jsonResponse(result);
  } catch (error) {
    console.error(`Failed to complete extension task ${id}`, error);
    return jsonError("Failed to complete extension task", 500);
  }
}
