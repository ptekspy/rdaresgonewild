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
          className="w-32 sm:w-40 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-red-500"
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
        <button
          type="submit"
          className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md text-xs font-medium"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError("");
            setInput(activeUsername ? `u/${activeUsername}` : "");
          }}
          className="px-2 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs"
        >
          Cancel
        </button>
        {error && (
          <span className="absolute right-0 top-9 w-48 rounded-md border border-red-900 bg-red-950 px-2 py-1 text-xs text-red-200 shadow-lg">
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
        className="px-3 py-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 text-xs sm:text-sm transition-colors"
      >
        Play As u/
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 text-xs sm:text-sm">
      <Link
        href={`/u/${activeUsername}`}
        className="max-w-36 truncate px-3 py-1.5 rounded-md border border-red-950 bg-red-950/40 text-red-200 hover:text-white hover:border-red-800 transition-colors"
      >
        Playing as u/{activeUsername}
      </Link>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="px-2 py-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
      >
        Change
      </button>
      <button
        type="button"
        onClick={clearPlayAsUsername}
        className="px-2 py-1.5 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
