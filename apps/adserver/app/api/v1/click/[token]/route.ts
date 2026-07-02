import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rdgw/database";
import { securityHeaders } from "@/lib/ads/http";
import { sha256, verifyAdToken } from "@/lib/ads/tokens";
import { assertSafeClickTargetUrl } from "@/lib/ads/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const origin = request.headers.get("origin");

  let payload;
  try {
    payload = verifyAdToken(decodeURIComponent(token), "click");
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "Invalid click token" } },
      { status: 400, headers: securityHeaders(origin) },
    );
  }

  const creative = await prisma.creative.findUnique({
    where: { id: payload.creativeId },
    select: { id: true, targetUrl: true },
  });

  if (!creative || payload.targetUrlHash !== sha256(creative.targetUrl)) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "Invalid click target" } },
      { status: 400, headers: securityHeaders(origin) },
    );
  }

  let targetUrl: URL;
  try {
    targetUrl = assertSafeClickTargetUrl(creative.targetUrl);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "Unsupported click target" } },
      { status: 400, headers: securityHeaders(origin) },
    );
  }

  await prisma.adClick.create({
    data: {
      bookingId: payload.bookingId,
      creativeId: payload.creativeId,
      placementId: payload.placementId,
      siteId: payload.siteId,
      referrer: request.headers.get("referer")?.slice(0, 500),
      targetUrl: targetUrl.toString(),
    },
  });

  const headers = securityHeaders(origin);
  headers.set("Location", targetUrl.toString());

  return new NextResponse(null, {
    status: 302,
    headers,
  });
}
