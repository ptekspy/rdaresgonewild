"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PlayerSummary } from "@/lib/player-summary";
import { usePlayAsUsername } from "@/lib/play-as";

function formatRank(rank: number | null) {
  return rank ? `#${rank}` : "Unranked";
}

export function HomePlayerDashboard() {
  const username = usePlayAsUsername();
  const [summary, setSummary] = useState<PlayerSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!username) {
      setSummary(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/player-summary?username=${encodeURIComponent(username)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PlayerSummary | null) => setSummary(data))
      .catch((error) => {
        if (error.name !== "AbortError") setSummary(null);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [username]);

  if (!username) return null;

  const unlocked = summary?.achievements.filter((achievement) => achievement.unlocked) ?? [];
  const primaryGoal = summary?.suggestedGoals[0] ?? null;

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Your run</p>
          <h2 className="text-xl font-bold">u/{username}</h2>
        </div>
        <Link href={`/u/${username}`} className="px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-300 hover:text-white hover:border-zinc-500">
          Open profile
        </Link>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Playbook", value: loading ? "..." : `${summary?.playbookCompletedCount ?? 0}/${summary?.totalDares ?? 0}` },
              { label: "Rank", value: loading ? "..." : formatRank(summary?.leaderboardRank ?? null) },
              { label: "Community", value: loading ? "..." : String(summary?.communityCompletedCount ?? 0) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3">
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-xs text-zinc-500">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>{summary?.highestLevel ? `Highest: ${summary.highestLevel.label}` : "No level reached yet"}</span>
              <span>{summary?.percentComplete ?? 0}%</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full" style={{ width: `${summary?.percentComplete ?? 0}%` }} />
            </div>
          </div>

          {summary?.syncMessage && (
            <p className="text-sm text-zinc-500">{summary.syncMessage}</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Next goal</p>
            {primaryGoal ? (
              <Link href={primaryGoal.href} className="block mt-1 group">
                <p className="font-semibold group-hover:text-red-400 transition-colors">{primaryGoal.label}</p>
                <p className="text-sm text-zinc-500 mt-1">{primaryGoal.description}</p>
              </Link>
            ) : (
              <p className="text-sm text-zinc-500 mt-1">No goals available yet.</p>
            )}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Achievements</p>
            <p className="text-sm text-zinc-400 mt-1">
              {unlocked.length}/{summary?.achievements.length ?? 6} unlocked
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(summary?.achievements ?? []).slice(0, 6).map((achievement) => (
                <span
                  key={achievement.id}
                  className={`px-2 py-1 rounded border text-xs ${
                    achievement.unlocked
                      ? "border-red-800 bg-red-950/50 text-red-200"
                      : "border-zinc-800 text-zinc-600"
                  }`}
                >
                  {achievement.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
