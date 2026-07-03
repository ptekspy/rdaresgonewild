import { NextRequest } from "next/server";
import { prisma } from "@rdgw/database";
import { jsonResponse, optionsResponse } from "@/lib/ads/http";
import { sha256, verifyAdToken } from "@/lib/ads/tokens";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  let body: { impressionToken?: unknown; path?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse(
      { ok: false, error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400, origin },
    );
  }

  if (typeof body.impressionToken !== "string") {
    return jsonResponse(
      { ok: false, error: { code: "BAD_REQUEST", message: "impressionToken is required" } },
      { status: 400, origin },
    );
  }

  let payload;
  try {
    payload = verifyAdToken(body.impressionToken, "impression");
  } catch {
    return jsonResponse(
      { ok: false, error: { code: "BAD_REQUEST", message: "Invalid impression token" } },
      { status: 400, origin },
    );
  }

  const tokenHash = sha256(body.impressionToken);
  const path = typeof body.path === "string" ? body.path.slice(0, 500) : undefined;
  const referrer = request.headers.get("referer")?.slice(0, 500);

  await prisma.adImpression
    .create({
      data: {
        bookingId: payload.bookingId,
        creativeId: payload.creativeId,
        placementId: payload.placementId,
        siteId: payload.siteId,
        path,
        referrer,
        tokenHash,
      },
    })
    .catch((error: { code?: string }) => {
      if (error.code !== "P2002") {
        throw error;
      }
    });

  return jsonResponse({ ok: true }, { origin });
}
