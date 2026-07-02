"use client";

import { setPlayAsUsername, usePlayAsUsername } from "@/lib/play-as";

interface Props {
  username: string;
}

export function ProfilePersonalization({ username }: Props) {
  const activeUsername = usePlayAsUsername();
  const isActive = activeUsername.toLowerCase() === username.toLowerCase();

  if (isActive) {
    return (
      <span className="inline-flex items-center rounded-md border border-red-900 bg-red-950/50 px-3 py-1.5 text-sm font-medium text-red-200">
        Your progress
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlayAsUsername(username)}
      className="px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
    >
      Play As this user
    </button>
  );
}
