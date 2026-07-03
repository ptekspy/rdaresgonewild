"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runUserSync } from "../crawler/actions";

type Props = {
  username: string;
  syncStatus: string;
};

export function ScanUserProfileButton({ username, syncStatus }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const isSyncing = syncStatus === "syncing";
  const disabled = isPending || isSyncing;

  function scanProfile() {
    setMessage(null);
    startTransition(async () => {
      const result = await runUserSync(username, "auto");
      setMessage(result.message);
      if (result.success) {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex min-w-32 flex-col items-start gap-1">
      <button
        type="button"
        className="button-secondary min-h-8 px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={scanProfile}
        title={message ?? `Scan u/${username}'s profile`}
      >
        {isPending ? "Scanning..." : isSyncing ? "Syncing..." : "Scan profile"}
      </button>
      {message && (
        <span
          className={`max-w-40 text-xs ${message.startsWith("Synced") ? "text-green-400" : "text-red-300"}`}
          title={message}
        >
          {message.startsWith("Synced") ? "Scan complete" : "Scan failed"}
        </span>
      )}
    </div>
  );
}
