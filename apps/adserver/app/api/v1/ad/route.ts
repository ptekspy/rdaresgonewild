import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { makeTokenPayload, sha256, signAdToken } from "@/lib/ads/tokens";
import { jsonResponse, optionsResponse } from "@/lib/ads/http";
import { toPublicAd } from "@/lib/ads/public-ad";
import { selectAd } from "@/lib/ads/select-ad";

export const dynamic = "force-dynamic";

type ErrorCode = "BAD_REQUEST" | "UNKNOWN_SITE" | "UNKNOWN_PLACEMENT" | "PLACEMENT_DISABLED";

function errorResponse(code: ErrorCode, message: string, origin: string | null, status = 400) {
  return jsonResponse({ ok: false, error: { code, message } }, { status, origin });
}

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const siteKey = request.nextUrl.searchParams.get("site")?.trim();
  const placementKey = request.nextUrl.searchParams.get("placement")?.trim();

  if (!siteKey || !placementKey) {
    return errorResponse("BAD_REQUEST", "site and placement are required", origin);
  }

  const result = await selectAd(siteKey, placementKey);
  if (!result.ok) {
    return errorResponse(result.code, result.message, origin, result.code === "PLACEMENT_DISABLED" ? 403 : 404);
  }

  if (!result.booking) {
    return jsonResponse({ ok: true, ad: null }, { origin });
  }

  const requestId = crypto.randomUUID();
  const tokenBase = {
    requestId,
    bookingId: result.booking.id,
    creativeId: result.booking.creativeId,
    placementId: result.booking.placementId,
    siteId: result.booking.placement.siteId,
  };
  const impressionToken = signAdToken(makeTokenPayload("impression", tokenBase));
  const clickToken = signAdToken(
    makeTokenPayload("click", {
      ...tokenBase,
      targetUrlHash: sha256(result.booking.creative.targetUrl),
    }),
  );
  const publicBaseUrl = process.env.ADS_PUBLIC_BASE_URL ?? request.nextUrl.origin;
  const clickUrl = new URL(`/api/v1/click/${encodeURIComponent(clickToken)}`, publicBaseUrl).toString();

  return jsonResponse(
    {
      ok: true,
      ad: toPublicAd({
        requestId,
        impressionToken,
        clickUrl,
        booking: result.booking,
      }),
    },
    { origin },
  );
}
