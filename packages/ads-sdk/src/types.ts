import type { ReactNode } from "react";

export type PublicAd = {
  requestId: string;
  impressionToken: string;
  bookingId: string;
  creativeId: string;
  siteKey: string;
  placementKey: string;
  label: "Sponsored" | "Ad";
  type: "IMAGE" | "TEXT" | "IMAGE_TEXT";
  imageUrl?: string;
  headline?: string;
  body?: string;
  ctaText?: string;
  altText?: string;
  clickUrl: string;
  width?: number;
  height?: number;
};

export type GetAdResponse =
  | { ok: true; ad: PublicAd | null }
  | { ok: false; error: { code: string; message: string } };

export type AdSlotProps = {
  placement: string;
  siteKey?: string;
  className?: string;
  fallback?: ReactNode;
  path?: string;
  label?: string;
  reserveSpace?: boolean;
};
