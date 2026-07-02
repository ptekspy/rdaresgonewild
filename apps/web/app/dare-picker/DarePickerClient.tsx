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

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
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
            {loading ? "..." : "Pick Dare"}
          </button>
        </div>

        <div className="space-y-3">
          <details className="bg-zinc-900 border border-zinc-800 rounded-lg">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-white">
              Spiciness: Level {minLevel}-{maxLevel}
            </summary>
            <div className="px-4 pb-4 pt-1 space-y-4">
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
                  className="w-full accent-red-500"
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
                  className="w-full accent-red-500"
                />
              </div>
            </div>
          </details>

          <details className="bg-zinc-900 border border-zinc-800 rounded-lg">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-white">
              Requirements
              {selectedRequirements.length > 0 && (
                <span className="ml-2 text-xs text-red-400">
                  {selectedRequirements.length} selected
                </span>
              )}
            </summary>
            <div className="px-4 pb-4 pt-1 space-y-3">
              {selectedRequirements.length < requirementOptions.length && (
                <button
                  type="button"
                  onClick={selectAllRequirements}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Clear filters
                </button>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                {requirementOptions.map((requirement) => (
                  <label
                    key={requirement.id}
                    className="flex min-h-10 items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRequirementSet.has(requirement.id)}
                      onChange={() => toggleRequirement(requirement.id)}
                      className="h-4 w-4 accent-red-500"
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
        <div className="px-4 py-3 bg-red-950 border border-red-800 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {result?.status === "no_dares_left" && (
        <div className="px-4 py-8 bg-zinc-900 border border-zinc-800 rounded-xl text-center space-y-3">
          <div className="text-4xl">🏆</div>
          <p className="text-white font-bold text-xl">No matching dares</p>
          <p className="text-zinc-400 text-sm">
            u/{normaliseUsername(username)} has no unplayed dares in this filter range.
          </p>
        </div>
      )}

      {result?.status === "done" && result.dare && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 pt-5 flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 bg-red-950 text-red-400 text-xs font-medium rounded border border-red-900">
              Level {result.dare.levelOrder} · {levelLabel}
            </span>
            <span className="text-xs text-zinc-500">
              {result.completedCount}/{totalDares} completed
            </span>
            <span className="text-xs text-zinc-500">
              {result.eligibleCount} matching
            </span>
          </div>

          <div className="px-5 py-5 space-y-2">
            <div className="flex items-start gap-3">
              <span className="text-4xl">{result.dare.emoji}</span>
              <div>
                <h2 className="text-xl font-bold text-white">{result.dare.name}</h2>
                <p className="text-zinc-400 text-sm leading-relaxed mt-1">{result.dare.description}</p>
              </div>
            </div>
          </div>

          <div className="px-5 pb-2">
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all"
                style={{ width: `${(result.completedCount / totalDares) * 100}%` }}
              />
            </div>
          </div>

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
              type="button"
              onClick={() => pick(username)}
              className="px-4 py-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white text-sm rounded-lg transition-colors"
            >
              Pick again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
