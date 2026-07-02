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
    <section className="rdgw-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Your run</p>
          <h2 className="mt-1 text-2xl font-black text-white">u/{username}</h2>
        </div>
        <Link href={`/u/${username}`} className="rdgw-button-secondary px-4 py-2 text-sm">
          Open profile
        </Link>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Playbook", value: loading ? "..." : `${summary?.playbookCompletedCount ?? 0}/${summary?.totalDares ?? 0}` },
              { label: "Rank", value: loading ? "..." : formatRank(summary?.leaderboardRank ?? null) },
              { label: "Community", value: loading ? "..." : String(summary?.communityCompletedCount ?? 0) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-3">
                <p className="text-lg font-black text-white">{stat.value}</p>
                <p className="text-xs text-zinc-500">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>{summary?.highestLevel ? `Highest: ${summary.highestLevel.label}` : "No level reached yet"}</span>
              <span>{summary?.percentComplete ?? 0}%</span>
            </div>
            <div className="rdgw-progress">
              <div className="rdgw-progress-fill" style={{ width: `${summary?.percentComplete ?? 0}%` }} />
            </div>
          </div>

          {summary?.syncMessage && (
            <p className="text-sm text-zinc-500">{summary.syncMessage}</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Next goal</p>
            {primaryGoal ? (
              <Link href={primaryGoal.href} className="group mt-1 block">
                <p className="font-bold text-white transition group-hover:text-pink-200">{primaryGoal.label}</p>
                <p className="mt-1 text-sm text-zinc-500">{primaryGoal.description}</p>
              </Link>
            ) : (
              <p className="mt-1 text-sm text-zinc-500">No goals available yet.</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Achievements</p>
            <p className="mt-1 text-sm text-zinc-400">
              {unlocked.length}/{summary?.achievements.length ?? 6} unlocked
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(summary?.achievements ?? []).slice(0, 6).map((achievement) => (
                <span
                  key={achievement.id}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    achievement.unlocked
                      ? "border-pink-500/30 bg-pink-500/[0.12] text-pink-100"
                      : "border-white/[0.08] text-zinc-600"
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
