"use client";

import { AdSlot as PaidPolitelyAdSlot } from "@paidpolitely/ads-sdk/react";

interface Props {
  slotKey: string;
  className?: string;
}

const PLACEMENT_MAP: Record<string, string> = {
  home_banner: "homepage_top",
  leaderboard_banner: "leaderboard_top",
  dare_picker_sidebar: "dare_picker_top",
  profile_sidebar: "profile_sidebar",
};

export function AdSlot({ slotKey, className = "" }: Props) {
  return (
    <PaidPolitelyAdSlot
      placement={PLACEMENT_MAP[slotKey] ?? slotKey}
      className={`ad-slot ${className}`}
      reserveSpace={false}
    />
  );
}
