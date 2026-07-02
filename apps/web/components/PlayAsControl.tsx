"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearPlayAsUsername, setPlayAsUsername, usePlayAsUsername } from "@/lib/play-as";
import { isValidUsername, normaliseUsername } from "@/lib/username";

export function PlayAsControl() {
  const activeUsername = usePlayAsUsername();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setInput(activeUsername ? `u/${activeUsername}` : "");
  }, [activeUsername]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const username = normaliseUsername(input);

    if (!isValidUsername(username)) {
      setError("Use 3-20 letters, numbers, _ or -");
      return;
    }

    setPlayAsUsername(username);
    setError("");
    setEditing(false);
  }

  if (editing) {
    return (
      <form onSubmit={submit} className="relative flex items-center gap-1">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError("");
          }}
          placeholder="u/username"
          className="w-32 rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none transition focus:border-pink-500/70 sm:w-40"
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
        <button type="submit" className="rdgw-button-primary px-3 py-2 text-xs">
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError("");
            setInput(activeUsername ? `u/${activeUsername}` : "");
          }}
          className="rounded-full px-2 py-2 text-xs text-zinc-500 transition hover:bg-white/[0.07] hover:text-zinc-200"
        >
          Cancel
        </button>
        {error && (
          <span className="absolute right-0 top-11 z-20 w-48 rounded-2xl border border-pink-500/30 bg-[#1b0d1b] px-3 py-2 text-xs text-pink-100 shadow-xl">
            {error}
          </span>
        )}
      </form>
    );
  }

  if (!activeUsername) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-full border border-white/10 bg-white/[0.035] px-3.5 py-2 text-xs font-semibold text-zinc-300 transition hover:border-pink-500/40 hover:text-white sm:text-sm"
      >
        Play As u/
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 text-xs sm:text-sm">
      <Link
        href={`/u/${activeUsername}`}
        className="max-w-40 truncate rounded-full border border-pink-500/30 bg-pink-500/[0.12] px-3 py-2 font-semibold text-pink-100 transition hover:border-orange-400/40 hover:text-white"
      >
        u/{activeUsername}
      </Link>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-full px-2 py-2 text-zinc-500 transition hover:bg-white/[0.07] hover:text-zinc-200"
      >
        Change
      </button>
      <button
        type="button"
        onClick={clearPlayAsUsername}
        className="rounded-full px-2 py-2 text-zinc-600 transition hover:bg-white/[0.07] hover:text-zinc-300"
      >
        Clear
      </button>
    </div>
  );
}
