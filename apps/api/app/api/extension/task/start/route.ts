import { type NextRequest } from "next/server";

import { ExtensionModeTaskError, startExtensionModeTask } from "@/lib/extension-mode-tasks";
import { jsonError, jsonResponse, optionsResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await startExtensionModeTask(body);
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof ExtensionModeTaskError) return jsonError(error.message, error.status);
    console.error("Failed to start extension mode task", error);
    return jsonError("Failed to start extension mode task", 500);
  }
}
