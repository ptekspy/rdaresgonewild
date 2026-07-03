"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TimelineFilters, TimelineItem, TimelineSort, TimelineType } from "@/lib/timeline";
import { getRedditUrl } from "@/lib/urls";

interface Props {
  initialItems: TimelineItem[];
  initialNextCursor: string | null;
  initialFilters: TimelineFilters;
}

interface TimelineResponse {
  items: TimelineItem[];
  nextCursor: string | null;
}

const TABS: Array<{ type: TimelineType; label: string }> = [
  { type: "all", label: "All" },
  { type: "playbook", label: "Playbook" },
  { type: "community", label: "Community" },
  { type: "redgifs", label: "Redgifs" },
];

export function TimelineClient({ initialItems, initialNextCursor, initialFilters }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    creator: initialFilters.creator,
    darer: initialFilters.darer,
    q: initialFilters.q,
    sort: initialFilters.sort,
  });

  useEffect(() => {
    setItems(initialItems);
    setNextCursor(initialNextCursor);
    setDraft({
      creator: initialFilters.creator,
      darer: initialFilters.darer,
      q: initialFilters.q,
      sort: initialFilters.sort,
    });
    setError(null);
  }, [initialItems, initialNextCursor, initialFilters]);

  const activeType = initialFilters.type;

  function queryString(next: Partial<TimelineFilters & { cursor: string }> = {}) {
    const params = new URLSearchParams();
    const type = next.type ?? initialFilters.type;
    const sort = next.sort ?? draft.sort;
    const creator = next.creator ?? draft.creator;
    const darer = next.darer ?? draft.darer;
    const q = next.q ?? draft.q;
    const cursor = next.cursor ?? "";

    if (type !== "all") params.set("type", type);
    if (sort !== "latest") params.set("sort", sort);
    if (creator.trim()) params.set("creator", creator.trim());
    if (darer.trim()) params.set("darer", darer.trim());
    if (q.trim()) params.set("q", q.trim());
    if (cursor) params.set("cursor", cursor);

    return params.toString();
  }

  function navigate(next: Partial<TimelineFilters> = {}) {
    const qs = queryString(next);
    router.push(qs ? `/timeline?${qs}` : "/timeline");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({
      creator: draft.creator,
      darer: draft.darer,
      q: draft.q,
      sort: draft.sort,
    });
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      const qs = queryString({ cursor: nextCursor });
      const res = await fetch(`/api/timeline?${qs}`, { cache: "no-store" });
      const data = (await res.json()) as TimelineResponse & { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Could not load more posts.");
        return;
      }

      setItems((current) => [...current, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      setError("Network error while loading more posts.");
    } finally {
      setLoadingMore(false);
    }
  }

  const emptyMessage = useMemo(() => {
    if (activeType === "playbook") return "No playbook completion posts match these filters.";
    if (activeType === "community") return "No community dare posts match these filters.";
    if (activeType === "redgifs") return "No Redgifs posts match these filters.";
    return "No timeline posts match these filters.";
  }, [activeType]);

  return (
    <div className="space-y-5">
      <section className="rdgw-card p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const href = queryString({ type: tab.type, cursor: "" });
            const active = activeType === tab.type;
            return (
              <Link
                key={tab.type}
                href={href ? `/timeline?${href}` : "/timeline"}
                className={`rounded-full px-4 py-2 text-sm font-black transition ${
                  active
                    ? "bg-pink-500 text-white shadow-lg shadow-pink-950/30"
                    : "border border-white/10 bg-white/[0.04] text-zinc-300 hover:border-pink-500/45 hover:text-white"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr_auto_auto]">
          <label className="sr-only" htmlFor="timeline-creator">
            Creator
          </label>
          <input
            id="timeline-creator"
            value={draft.creator}
            onChange={(event) => setDraft((current) => ({ ...current, creator: event.target.value }))}
            placeholder="Creator username"
            className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-pink-500/70 focus:ring-4 focus:ring-pink-500/10"
          />

          <label className="sr-only" htmlFor="timeline-darer">
            Darer
          </label>
          <input
            id="timeline-darer"
            value={draft.darer}
            onChange={(event) => setDraft((current) => ({ ...current, darer: event.target.value }))}
            placeholder="Dared by username"
            className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-pink-500/70 focus:ring-4 focus:ring-pink-500/10"
          />

          <label className="sr-only" htmlFor="timeline-q">
            Search
          </label>
          <input
            id="timeline-q"
            value={draft.q}
            onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
            placeholder="Search titles and captions"
            className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-pink-500/70 focus:ring-4 focus:ring-pink-500/10"
          />

          <label className="sr-only" htmlFor="timeline-sort">
            Sort
          </label>
          <select
            id="timeline-sort"
            value={draft.sort}
            onChange={(event) => setDraft((current) => ({ ...current, sort: event.target.value as TimelineSort }))}
            className="min-h-11 rounded-2xl border border-white/10 bg-[#11152a] px-4 text-sm font-bold text-white outline-none transition focus:border-pink-500/70 focus:ring-4 focus:ring-pink-500/10"
          >
            <option value="latest">Latest</option>
            <option value="top">Top</option>
          </select>

          <button type="submit" className="rdgw-button-primary min-h-11 px-5 text-sm">
            Filter
          </button>
        </form>
      </section>

      {items.length === 0 ? (
        <div className="rdgw-card px-5 py-12 text-center text-sm text-zinc-500">{emptyMessage}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <TimelineCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-pink-500/30 bg-pink-950/30 px-4 py-3 text-sm text-pink-100">
          {error}
        </div>
      )}

      {nextCursor && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rdgw-button-secondary min-h-11 px-6 text-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function TimelineCard({ item }: { item: TimelineItem }) {
  const created = new Date(item.createdAtReddit);
  const externalUrl = item.outboundUrl && item.outboundUrl !== item.permalink ? item.outboundUrl : null;
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setPreviewFailed(false);
  }, [item.previewUrl]);

  const previewUrl = item.previewUrl && !previewFailed ? item.previewUrl : null;

  return (
    <article className="rdgw-card flex min-h-full flex-col overflow-hidden rounded-2xl">
      <a
        href={getRedditUrl(item.permalink)}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block aspect-[16/10] overflow-hidden bg-white/[0.035]"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950 text-sm font-bold text-zinc-600">
            No preview
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
          {item.isRedgifs && <Badge label="Redgifs" tone="orange" />}
          {item.playbookDares.length > 0 && <Badge label="Playbook" tone="pink" />}
          {item.communityDares.length > 0 && <Badge label="Community" tone="zinc" />}
        </div>
      </a>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3 text-xs text-zinc-500">
          <Link href={`/u/${item.authorUsername}`} className="rdgw-link font-black">
            u/{item.authorUsername}
          </Link>
          <time dateTime={item.createdAtReddit} className="shrink-0">
            {formatDate(created)}
          </time>
        </div>

        <h2 className="mt-3 line-clamp-3 text-base font-black leading-6 text-white">{item.title}</h2>

        <div className="mt-3 flex flex-wrap gap-2">
          {item.flair && <Badge label={item.flair} tone="zinc" />}
          {item.playbookDares.slice(0, 2).map((dare) => (
            <Badge key={dare.slug} label={`${dare.emoji} ${dare.name}`} tone="pink" />
          ))}
          {item.communityDares.slice(0, 2).map((dare) => (
            <Badge key={dare.darerUsername} label={`Dared by u/${dare.darerUsername}`} tone="zinc" />
          ))}
        </div>

        <div className="mt-auto pt-4">
          <div className="flex items-center gap-3 text-xs font-bold text-zinc-500">
            <span>{formatNumber(item.score)} pts</span>
            <span>{formatNumber(item.commentCount)} comments</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={getRedditUrl(item.permalink)}
              target="_blank"
              rel="noopener noreferrer"
              className="rdgw-button-primary px-4 py-2 text-xs"
            >
              Reddit
            </a>
            {externalUrl && (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rdgw-button-secondary px-4 py-2 text-xs"
              >
                Media
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function Badge({ label, tone }: { label: string; tone: "pink" | "orange" | "zinc" }) {
  const className =
    tone === "pink"
      ? "border-pink-500/30 bg-pink-500/[0.14] text-pink-100"
      : tone === "orange"
        ? "border-orange-400/30 bg-orange-400/[0.14] text-orange-100"
        : "border-white/10 bg-white/[0.08] text-zinc-200";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[0.7rem] font-black leading-none ${className}`}>
      {label}
    </span>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: value > 9999 ? "compact" : "standard" }).format(value);
}
