"use client";

import { useEffect, useMemo, useState } from "react";
import { LEVEL_LABELS } from "@rdgw/playbook";
import { setPlayAsUsername, usePlayAsUsername } from "@/lib/play-as";
import { isValidUsername, normaliseUsername } from "@/lib/username";

interface DareResult {
  status: "done" | "no_dares_left";
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
  eligibleCount: number;
}

interface RequirementOption {
  id: string;
  label: string;
}

interface Props {
  totalDares: number;
  levelNames: Array<{ key: string; label: string; count: number }>;
  requirementOptions: RequirementOption[];
}

const MIN_LEVEL = 1;
const MAX_LEVEL = 13;

export function DarePickerClient({ totalDares, levelNames, requirementOptions }: Props) {
  const activeUsername = usePlayAsUsername();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minLevel, setMinLevel] = useState(MIN_LEVEL);
  const [maxLevel, setMaxLevel] = useState(MAX_LEVEL);
  const [selectedRequirements, setSelectedRequirements] = useState<string[]>(
    () => requirementOptions.map((requirement) => requirement.id)
  );

  useEffect(() => {
    if (activeUsername && !username) {
      setUsername(`u/${activeUsername}`);
    }
  }, [activeUsername, username]);

  const selectedRequirementSet = useMemo(
    () => new Set(selectedRequirements),
    [selectedRequirements]
  );

  async function pick(u: string) {
    const pickedUsername = normaliseUsername(u);

    if (!isValidUsername(pickedUsername)) {
      setError("Use a valid Reddit username: 3-20 letters, numbers, _ or -");
      return;
    }

    setError(null);
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/dare-picker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: pickedUsername,
          minLevel,
          maxLevel,
          requirements: selectedRequirements,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      setPlayAsUsername(pickedUsername);
      setUsername(`u/${pickedUsername}`);
      setResult(data);
    } catch {
      setError("Network error - please try again");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    pick(username);
  }

  function updateMinLevel(value: number) {
    setMinLevel(value);
    if (value > maxLevel) setMaxLevel(value);
  }

  function updateMaxLevel(value: number) {
    setMaxLevel(value);
    if (value < minLevel) setMinLevel(value);
  }

  function toggleRequirement(id: string) {
    setSelectedRequirements((current) =>
      current.includes(id)
        ? current.filter((requirement) => requirement !== id)
        : [...current, id]
    );
  }

  function selectAllRequirements() {
    setSelectedRequirements(requirementOptions.map((requirement) => requirement.id));
  }

  const levelLabel = result?.dare
    ? (LEVEL_LABELS as Record<string, string>)[result.dare.level] ?? result.dare.level
    : null;
  const minLevelName = levelNames[minLevel - 1]?.label ?? `Level ${minLevel}`;
  const maxLevelName = levelNames[maxLevel - 1]?.label ?? `Level ${maxLevel}`;
  const completionPct = result ? Math.round((result.completedCount / totalDares) * 100) : 0;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="rdgw-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="dare-picker-username">
            Reddit username
          </label>
          <input
            id="dare-picker-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="u/YourRedditUsername"
            className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-pink-500/70 focus:ring-4 focus:ring-pink-500/10"
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="rdgw-button-primary min-h-12 px-6 text-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {loading ? "Picking..." : "Pick dare"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <details className="rounded-2xl border border-white/10 bg-white/[0.035]">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-white">
              Spiciness: Level {minLevel}-{maxLevel}
            </summary>
            <div className="space-y-4 px-4 pb-4 pt-1">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs text-zinc-400">
                  <span>Minimum</span>
                  <span className="text-zinc-200">
                    {minLevel}: {minLevelName}
                  </span>
                </div>
                <input
                  type="range"
                  min={MIN_LEVEL}
                  max={MAX_LEVEL}
                  value={minLevel}
                  onChange={(e) => updateMinLevel(Number(e.target.value))}
                  className="w-full accent-pink-500"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs text-zinc-400">
                  <span>Maximum</span>
                  <span className="text-zinc-200">
                    {maxLevel}: {maxLevelName}
                  </span>
                </div>
                <input
                  type="range"
                  min={MIN_LEVEL}
                  max={MAX_LEVEL}
                  value={maxLevel}
                  onChange={(e) => updateMaxLevel(Number(e.target.value))}
                  className="w-full accent-pink-500"
                />
              </div>
            </div>
          </details>

          <details className="rounded-2xl border border-white/10 bg-white/[0.035]">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-white">
              Requirements
              {selectedRequirements.length > 0 && (
                <span className="ml-2 rounded-full bg-pink-500/[0.12] px-2 py-0.5 text-xs text-pink-200">
                  {selectedRequirements.length} selected
                </span>
              )}
            </summary>
            <div className="space-y-3 px-4 pb-4 pt-1">
              {selectedRequirements.length < requirementOptions.length && (
                <button
                  type="button"
                  onClick={selectAllRequirements}
                  className="text-xs font-semibold text-zinc-400 transition hover:text-white"
                >
                  Select all requirements
                </button>
              )}

              <div className="grid gap-2">
                {requirementOptions.map((requirement) => (
                  <label
                    key={requirement.id}
                    className="flex min-h-10 items-center gap-3 rounded-xl border border-white/[0.08] bg-[#090b16]/70 px-3 py-2 text-sm text-zinc-300"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRequirementSet.has(requirement.id)}
                      onChange={() => toggleRequirement(requirement.id)}
                      className="h-4 w-4 accent-pink-500"
                    />
                    <span>{requirement.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </details>
        </div>
      </form>

      {error && (
        <div className="rounded-2xl border border-pink-500/30 bg-pink-950/30 px-4 py-3 text-sm text-pink-100">
          {error}
        </div>
      )}

      {result?.status === "no_dares_left" && (
        <div className="rdgw-card px-4 py-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.07] text-3xl">🏆</div>
          <p className="text-xl font-black text-white">No matching dares</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
            u/{normaliseUsername(username)} has no unplayed dares in this filter range.
          </p>
        </div>
      )}

      {result?.status === "done" && result.dare && (
        <div className="rdgw-card-strong rdgw-glow-border overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-5 pt-5">
            <span className="rounded-full border border-pink-500/30 bg-pink-500/[0.12] px-3 py-1 text-xs font-bold text-pink-100">
              Level {result.dare.levelOrder} · {levelLabel}
            </span>
            <span className="text-xs text-zinc-500">
              {result.completedCount}/{totalDares} completed
            </span>
            <span className="text-xs text-zinc-500">
              {result.eligibleCount} matching
            </span>
          </div>

          <div className="px-5 py-6">
            <div className="flex items-start gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white/[0.07] text-4xl">
                {result.dare.emoji}
              </span>
              <div>
                <h2 className="text-2xl font-black text-white">{result.dare.name}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{result.dare.description}</p>
              </div>
            </div>
          </div>

          <div className="px-5 pb-2">
            <div className="rdgw-progress">
              <div className="rdgw-progress-fill transition-all" style={{ width: `${completionPct}%` }} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-white/10 px-5 py-4">
            <a
              href={`https://www.reddit.com/r/daresgonewild/submit/?title=${encodeURIComponent(`${result.dare.emoji} ${result.dare.name} [Dared by the playbook]`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rdgw-button-primary px-4 py-2 text-sm"
            >
              I completed it →
            </a>
            <button
              type="button"
              onClick={() => pick(username)}
              className="rdgw-button-secondary px-4 py-2 text-sm"
            >
              Pick again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
