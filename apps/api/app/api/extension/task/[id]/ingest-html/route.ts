import { type NextRequest } from "next/server";

import { ingestExtensionHtmlBatch } from "@/lib/extension-html-ingest";
import { ExtensionTaskError } from "@/lib/extension-scheduler";
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
    const result = await ingestExtensionHtmlBatch(id, body);
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof ExtensionTaskError) return jsonError(error.message, error.status);

    console.error(`Failed to ingest extension HTML task ${id}`, error);
    return jsonError("Failed to ingest extension HTML task", 500);
  }
}
