import { NextResponse } from "next/server";

export function getAllowedOrigins() {
  return (process.env.ADS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function securityHeaders(origin?: string | null) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });

  const allowedOrigins = getAllowedOrigins();
  if (origin && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Accept");

  return headers;
}

export function jsonResponse<T>(body: T, init?: ResponseInit & { origin?: string | null }) {
  return NextResponse.json(body, {
    ...init,
    headers: securityHeaders(init?.origin),
  });
}

export function optionsResponse(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: securityHeaders(request.headers.get("origin")),
  });
}
