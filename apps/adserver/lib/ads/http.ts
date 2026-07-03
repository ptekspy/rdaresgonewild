import { NextResponse } from "next/server";

export function securityHeaders() {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });

  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Accept");

  return headers;
}

export function jsonResponse<T>(body: T, init?: ResponseInit & { origin?: string | null }) {
  return NextResponse.json(body, {
    ...init,
    headers: securityHeaders(),
  });
}

export function optionsResponse() {
  return new NextResponse(null, {
    status: 204,
    headers: securityHeaders(),
  });
}
