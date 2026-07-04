import { prisma } from "@rdgw/database";
import { jsonError, jsonResponse, optionsResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;

  const session = await prisma.extensionIngestSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      redditUsername: true,
      crawlMode: true,
      sourceUrl: true,
      status: true,
      pagesScanned: true,
      postsReceived: true,
      lastCursor: true,
      lastError: true,
      startedAt: true,
      updatedAt: true,
      completedAt: true,
    },
  });

  if (!session) return jsonError("Unknown ingest session", 404);

  return jsonResponse({ session });
}
