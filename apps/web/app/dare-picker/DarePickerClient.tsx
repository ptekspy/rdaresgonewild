"use client";

import { useState } from "react";
import { LEVEL_LABELS } from "@rdgw/playbook";

interface DareResult {
  status: "syncing" | "done" | "no_dares_left";
  dare?: {
    slug: string;
    emoji: string;
    name: string;
    description: string;
    level: string;
    levelOrder: number;
  };
  completedCount: number;
  totalDares: number;
  message?: string;
}

interface Props {
  totalDares: number;
  levelNames: Array<{ key: string; label: string; count: number }>;
}

export function DarePickerClient({ totalDares }: Props) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [result, setResult] = useState<DareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalise = (u: string) => u.replace(/^\/?u\//i, "").trim();

  async function pick(u: string) {
    setError(null);
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/dare-picker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalise(u) }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      if (data.status === "syncing") {
        setPolling(true);
        setResult(data);
        // Poll every 3s until done
        await pollUntilDone(normalise(u));
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
      setPolling(false);
    }
  }

  async function pollUntilDone(u: string, attempts = 0) {
    if (attempts > 20) {
      setError("Sync is taking longer than expected — try again in a minute");
      return;
    }
    await new Promise((r) => setTimeout(r, 3_000));
    const res = await fetch("/api/dare-picker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u }),
    });
    const data = await res.json();
    if (data.status === "syncing") {
      setResult(data);
      return pollUntilDone(u, attempts + 1);
    }
    setResult(data);
    setPolling(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    pick(username);
  }

  const levelLabel = result?.dare
    ? (LEVEL_LABELS as Record<string, string>)[result.dare.level] ?? result.dare.level
    : null;

  return (
    <div className="space-y-6">
      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="u/YourRedditUsername"
          className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500 transition-colors"
          disabled={loading}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={loading || !username.trim()}
          className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors"
        >
          {loading ? "…" : "Pick Dare"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-950 border border-red-800 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Syncing state */}
      {result?.status === "syncing" && (
        <div className="px-4 py-6 bg-zinc-900 border border-zinc-800 rounded-xl text-center space-y-2">
          <div className="text-2xl animate-pulse">⏳</div>
          <p className="text-zinc-300 font-medium">Syncing your dare history…</p>
          <p className="text-zinc-500 text-sm">{result.message ?? "This may take a moment for first-time users."}</p>
        </div>
      )}

      {/* No dares left */}
      {result?.status === "no_dares_left" && !polling && (
        <div className="px-4 py-8 bg-zinc-900 border border-zinc-800 rounded-xl text-center space-y-3">
          <div className="text-4xl">🏆</div>
          <p className="text-white font-bold text-xl">Legendary!</p>
          <p className="text-zinc-400 text-sm">
            u/{normalise(username)} has completed all {totalDares} dares. Absolute legend.
          </p>
        </div>
      )}

      {/* Dare result */}
      {result?.status === "done" && result.dare && !polling && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {/* Level badge */}
          <div className="px-5 pt-5 flex items-center gap-2">
            <span className="px-2 py-0.5 bg-red-950 text-red-400 text-xs font-medium rounded border border-red-900">
              Level {result.dare.levelOrder} · {levelLabel}
            </span>
            <span className="text-xs text-zinc-500">
              {result.completedCount}/{totalDares} completed
            </span>
          </div>

          {/* Dare card */}
          <div className="px-5 py-5 space-y-2">
            <div className="flex items-start gap-3">
              <span className="text-4xl">{result.dare.emoji}</span>
              <div>
                <h2 className="text-xl font-bold text-white">{result.dare.name}</h2>
                <p className="text-zinc-400 text-sm leading-relaxed mt-1">{result.dare.description}</p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-5 pb-2">
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all"
                style={{ width: `${(result.completedCount / totalDares) * 100}%` }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 py-4 border-t border-zinc-800 flex flex-wrap gap-3">
            <a
              href={`https://www.reddit.com/r/daresgonewild/submit/?title=${encodeURIComponent(`${result.dare.emoji} ${result.dare.name} [Dared by the playbook]`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              I completed it! →
            </a>
            <button
              onClick={() => pick(username)}
              className="px-4 py-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white text-sm rounded-lg transition-colors"
            >
              🎲 Pick again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
