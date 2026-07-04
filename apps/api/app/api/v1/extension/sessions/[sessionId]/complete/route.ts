import { prisma } from "@rdgw/database";
import { jsonError, jsonResponse, optionsResponse } from "@/lib/http";
import { verifyUploadToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const uploadToken = typeof body?.uploadToken === "string" ? body.uploadToken : "";
  const scrolls = typeof body?.scrolls === "number" && Number.isFinite(body.scrolls) ? Math.max(0, Math.floor(body.scrolls)) : null;

  if (!uploadToken) return jsonError("uploadToken is required");

  const session = await prisma.extensionIngestSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      uploadTokenHash: true,
      status: true,
      pagesScanned: true,
    },
  });

  if (!session) return jsonError("Unknown ingest session", 404);
  if (!verifyUploadToken(uploadToken, session.uploadTokenHash)) return jsonError("Invalid upload token", 401);

  const completedSession = await prisma.extensionIngestSession.update({
    where: { id: session.id },
    data: {
      status: "completed",
      completedAt: new Date(),
      pagesScanned: scrolls === null ? session.pagesScanned : Math.max(session.pagesScanned, scrolls),
    },
    select: {
      id: true,
      status: true,
      pagesScanned: true,
      postsReceived: true,
      updatedAt: true,
      completedAt: true,
    },
  });

  return jsonResponse({ session: completedSession });
}
