import { type NextRequest } from "next/server";

import { ExtensionJsonIngestError, ingestExtensionJsonPosts } from "@/lib/extension-json-buffer";
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
    const result = await ingestExtensionJsonPosts(id, body);
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof ExtensionJsonIngestError) return jsonError(error.message, error.status);

    console.error(`Failed to ingest extension JSON task ${id}`, error);
    return jsonError("Failed to ingest extension JSON task", 500);
  }
}
