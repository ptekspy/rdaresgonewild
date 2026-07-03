import { prisma } from "@rdgw/database";
import { jsonError, jsonResponse, optionsResponse } from "@/lib/http";
import { normaliseInstallId, normaliseUsername } from "@/lib/reddit";
import { createUploadToken, hashUploadToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Invalid JSON body");

  const crawlMode = body.crawlMode === "page" ? "page" : "profile";
  const redditUsername = normaliseUsername(body.redditUsername);
  if (crawlMode === "profile" && !redditUsername) return jsonError("redditUsername must be a valid Reddit username");

  const extensionInstallId = normaliseInstallId(body.extensionInstallId);
  if (!extensionInstallId) return jsonError("extensionInstallId is required");

  const clientVersion = typeof body.clientVersion === "string" ? body.clientVersion.slice(0, 64) : undefined;
  const sourceUrl = parseRedditSourceUrl(body.sourceUrl);
  const uploadToken = createUploadToken();

  const session = await prisma.extensionIngestSession.create({
    data: {
      redditUsername: redditUsername ?? "pagecrawl",
      extensionInstallId,
      uploadTokenHash: hashUploadToken(uploadToken),
      clientVersion,
      crawlMode,
      sourceUrl,
    },
    select: {
      id: true,
      redditUsername: true,
      crawlMode: true,
      sourceUrl: true,
      status: true,
      startedAt: true,
    },
  });

  return jsonResponse({
    session,
    uploadToken,
    maxBatchSize: 100,
  });
}

function parseRedditSourceUrl(value: unknown) {
  if (typeof value !== "string") return undefined;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!/(^|\.)reddit\.com$/.test(host)) return undefined;
    url.hash = "";
    return url.toString().slice(0, 2048);
  } catch {
    return undefined;
  }
}
