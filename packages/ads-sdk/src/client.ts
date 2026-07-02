import type { GetAdResponse } from "./types";

export async function fetchAd(params: {
  apiUrl: string;
  siteKey: string;
  placement: string;
  path?: string;
}) {
  const url = new URL("/api/v1/ad", params.apiUrl);
  url.searchParams.set("site", params.siteKey);
  url.searchParams.set("placement", params.placement);
  if (params.path) url.searchParams.set("path", params.path);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: true, ad: null } as const satisfies GetAdResponse;
    }

    return (await response.json()) as GetAdResponse;
  } catch {
    return { ok: true, ad: null } as const satisfies GetAdResponse;
  }
}

export async function trackImpression(params: {
  apiUrl: string;
  impressionToken: string;
  visibleMs: number;
  path?: string;
}) {
  try {
    await fetch(new URL("/api/v1/impression", params.apiUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        impressionToken: params.impressionToken,
        visibleMs: params.visibleMs,
        path: params.path,
      }),
      keepalive: true,
    });
  } catch {
    // Consumer sites should never fail because ad tracking is unavailable.
  }
}
