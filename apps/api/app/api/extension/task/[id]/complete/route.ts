import { type NextRequest } from "next/server";

import { ExtensionTaskError, completeExtensionTask } from "@/lib/extension-scheduler";
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
    const body = await request.json().catch(() => ({}));
    const result = await completeExtensionTask(id, body);
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof ExtensionTaskError) return jsonError(error.message, error.status);

    console.error(`Failed to complete extension task ${id}`, error);
    return jsonError("Failed to complete extension task", 500);
  }
}
