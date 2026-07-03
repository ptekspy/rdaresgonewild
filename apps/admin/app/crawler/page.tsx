"use client";

import { useState } from "react";
import { runSubredditScan, runUserSync } from "./actions";

export default function CrawlerPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");

  async function handle(action: () => Promise<{ success: boolean; message: string }>) {
    setLoading(true);
    setStatus(null);
    const result = await action();
    setStatus(result.message);
    setLoading(false);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold">Crawler</h1>

      {status && (
        <div className={`px-4 py-3 rounded-lg border text-sm ${status.startsWith("Error") || status.includes("failed") ? "border-red-800 bg-red-950/30 text-red-300" : "border-green-800 bg-green-950/30 text-green-300"}`}>
          {status}
        </div>
      )}

      {/* Subreddit scan */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold">Subreddit Scan</h2>
        <p className="text-zinc-400 text-sm">
          Crawl r/daresgonewild/new from the last known cursor. Picks up new posts since the last run.
        </p>
        <button
          disabled={loading}
          onClick={() => handle(runSubredditScan)}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-sm rounded-lg transition-colors"
        >
          {loading ? "Running…" : "▶ Run subreddit scan"}
        </button>
      </div>

      {/* User sync */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold">User Sync</h2>
        <p className="text-zinc-400 text-sm">
          Sync a specific user&apos;s post history (without the u/ prefix).
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-zinc-500"
          />
          <button
            disabled={loading || !username.trim()}
            onClick={() => handle(() => runUserSync(username.trim(), "incremental"))}
            className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-sm rounded-lg transition-colors"
          >
            Incremental
          </button>
          <button
            disabled={loading || !username.trim()}
            onClick={() => handle(() => runUserSync(username.trim(), "full"))}
            className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-sm rounded-lg transition-colors"
          >
            Full
          </button>
        </div>
      </div>

      <div className="text-xs text-zinc-600 space-y-1">
        <p>⚠️ Rate limit: ~25 req/min. Full subreddit scans can take several minutes.</p>
        <p>⚠️ Make sure REDDIT_COOKIE is set in your .env.local.</p>
      </div>
    </div>
  );
}
