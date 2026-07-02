"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAd, trackImpression } from "../client";
import type { AdSlotProps, PublicAd } from "../types";

function getClientPath(path?: string) {
  if (path) return path;
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function defaultSiteKey() {
  return process.env.NEXT_PUBLIC_SITE_KEY;
}

function defaultApiUrl() {
  return process.env.NEXT_PUBLIC_ADS_API_URL ?? "https://ads.paidpolitely.com";
}

function AdCreative({ ad }: { ad: PublicAd }) {
  if (ad.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ad.imageUrl}
        alt={ad.altText ?? ad.headline ?? "Sponsored ad"}
        loading="lazy"
        style={{
          display: "block",
          width: "100%",
          maxWidth: "100%",
          maxHeight: 150,
          height: "auto",
          objectFit: "contain",
          objectPosition: "left center",
          borderRadius: 8,
        }}
      />
    );
  }

  return (
    <>
      {ad.headline ? <strong style={{ display: "block", color: "inherit" }}>{ad.headline}</strong> : null}
      {ad.body ? <span style={{ display: "block" }}>{ad.body}</span> : null}
      {ad.ctaText ? <span style={{ display: "inline-block", fontWeight: 700 }}>{ad.ctaText}</span> : null}
    </>
  );
}

export function AdSlot({
  placement,
  siteKey,
  className,
  fallback = null,
  path,
  label,
  reserveSpace = true,
}: AdSlotProps) {
  const [ad, setAd] = useState<PublicAd | null>(null);
  const [loaded, setLoaded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const trackedRef = useRef(false);
  const resolvedSiteKey = siteKey ?? defaultSiteKey();
  const apiUrl = defaultApiUrl();
  const resolvedPath = useMemo(() => getClientPath(path), [path]);

  useEffect(() => {
    let cancelled = false;

    if (!resolvedSiteKey) {
      setLoaded(true);
      return;
    }

    void fetchAd({
      apiUrl,
      siteKey: resolvedSiteKey,
      placement,
      path: resolvedPath,
    }).then((response) => {
      if (cancelled) return;
      setAd(response.ok ? response.ad : null);
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [apiUrl, placement, resolvedPath, resolvedSiteKey]);

  useEffect(() => {
    if (!wrapperRef.current || !ad || trackedRef.current) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          timer = setTimeout(() => {
            if (trackedRef.current) return;
            trackedRef.current = true;
            void trackImpression({
              apiUrl,
              impressionToken: ad.impressionToken,
              visibleMs: 1000,
              path: resolvedPath,
            });
            observer.disconnect();
          }, 1000);
        } else if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: [0, 0.5, 1] },
    );

    observer.observe(wrapperRef.current);

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [ad, apiUrl, resolvedPath]);

  const minHeight = reserveSpace && ad?.height ? ad.height : undefined;

  if (!loaded && reserveSpace) {
    return <div ref={wrapperRef} className={className} style={{ minHeight }} aria-hidden="true" />;
  }

  if (!ad) {
    return fallback;
  }

  return (
    <div ref={wrapperRef} className={className} style={{ minHeight, maxHeight: ad.imageUrl ? 180 : undefined }}>
      <a
        href={ad.clickUrl}
        target="_blank"
        rel="sponsored nofollow noopener noreferrer"
        style={{
          display: "block",
          color: "inherit",
          textDecoration: "none",
          maxHeight: ad.imageUrl ? 180 : undefined,
          overflow: ad.imageUrl ? "hidden" : undefined,
        }}
      >
        <span
          style={{
            display: "block",
            marginBottom: 6,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0,
            opacity: 0.75,
            textTransform: "uppercase",
          }}
        >
          {label ?? ad.label}
        </span>
        <span style={{ display: "grid", gap: 8 }}>
          <AdCreative ad={ad} />
        </span>
      </a>
    </div>
  );
}
