"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PlayerSummary } from "@/lib/player-summary";
import { usePlayAsUsername } from "@/lib/play-as";

interface Props {
  visibleUsernames: string[];
  tab: string;
}

function cssEscape(value: string) {
  if (typeof window !== "undefined" && window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
}

export function LeaderboardPersonalization({ visibleUsernames, tab }: Props) {
  const username = usePlayAsUsername();
  const [summary, setSummary] = useState<PlayerSummary | null>(null);
  const visible = username
    ? visibleUsernames.some((visibleUsername) => visibleUsername.toLowerCase() === username.toLowerCase())
    : false;

  useEffect(() => {
    document
      .querySelectorAll(".rdgw-active-leaderboard-row")
      .forEach((row) => row.classList.remove("rdgw-active-leaderboard-row"));

    if (!username) return;

    const row = document.querySelector(
      `[data-leaderboard-username="${cssEscape(username.toLowerCase())}"]`
    );
    row?.classList.add("rdgw-active-leaderboard-row");
  }, [username, visibleUsernames]);

  useEffect(() => {
    if (!username) {
      setSummary(null);
      return;
    }

    const controller = new AbortController();
    fetch(`/api/player-summary?username=${encodeURIComponent(username)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PlayerSummary | null) => setSummary(data))
      .catch((error) => {
        if (error.name !== "AbortError") setSummary(null);
      });

    return () => controller.abort();
  }, [username]);

  if (!username) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold">
          Your overall rank: <span className="text-red-300">{summary?.leaderboardRank ? `#${summary.leaderboardRank}` : "Unranked"}</span>
        </p>
        <p className="text-xs text-zinc-500">
          {visible
            ? `u/${username} is highlighted on this ${tab} page.`
            : `u/${username} is not visible on this page.`}
        </p>
      </div>
      <Link href={`/u/${username}`} className="px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-300 hover:text-white hover:border-zinc-500">
        View your progress
      </Link>
    </div>
  );
}
