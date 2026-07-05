"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { queueModelClassification } from "./classification-actions";

type Props = {
  username: string;
  status?: string | null;
};

export function ClassifyModelButton({ username, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const isActive = status === "QUEUED" || status === "RUNNING";
  const disabled = isPending || isActive;

  function classify() {
    setMessage(null);

    startTransition(async () => {
      const result = await queueModelClassification(username);
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-32 flex-col items-start gap-1">
      <button
        type="button"
        className="button-secondary min-h-8 px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={classify}
        title={message ?? `Classify u/${username}`}
      >
        {isPending ? "Queueing..." : status === "RUNNING" ? "Classifying..." : status === "QUEUED" ? "Queued" : "Classify"}
      </button>
      {message && (
        <span
          className={`max-w-40 text-xs ${message.startsWith("Queued") ? "text-green-400" : "text-red-300"}`}
          title={message}
        >
          {message.startsWith("Queued") ? "Queued" : "Failed"}
        </span>
      )}
    </div>
  );
}
