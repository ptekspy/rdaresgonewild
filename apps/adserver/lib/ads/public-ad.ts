import { type BookingWithRelations } from "./select-ad";

export function toPublicAd(input: {
  requestId: string;
  impressionToken: string;
  clickUrl: string;
  booking: BookingWithRelations;
}) {
  const { booking, requestId, impressionToken, clickUrl } = input;
  const creative = booking.creative;

  return {
    requestId,
    impressionToken,
    bookingId: booking.id,
    creativeId: creative.id,
    siteKey: booking.placement.site.key,
    placementKey: booking.placement.key,
    label: "Sponsored" as const,
    type: creative.type,
    imageUrl: creative.imageUrl ?? undefined,
    headline: creative.headline ?? undefined,
    body: creative.body ?? undefined,
    ctaText: creative.ctaText ?? undefined,
    altText: creative.altText ?? undefined,
    clickUrl,
    width: booking.placement.width ?? undefined,
    height: booking.placement.height ?? undefined,
  };
}
