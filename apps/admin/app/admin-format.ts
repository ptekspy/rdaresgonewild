export function formatDateTime(value: Date | null | undefined) {
  if (!value) return "never";
  return value.toISOString().slice(0, 16).replace("T", " ");
}

export function formatNumber(value: number | bigint | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-GB");
}

export function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return "0.00%";
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

export function statusClass(status: string) {
  const normalised = status.toLowerCase();
  if (["active", "approved", "fresh", "completed"].includes(normalised)) return "badge badge-green";
  if (["scheduled", "syncing", "running", "pending_review", "draft"].includes(normalised)) return "badge badge-yellow";
  if (["paused", "stale", "ended"].includes(normalised)) return "badge badge-orange";
  if (["failed", "rejected", "blocked"].includes(normalised)) return "badge badge-red";
  return "badge badge-zinc";
}
