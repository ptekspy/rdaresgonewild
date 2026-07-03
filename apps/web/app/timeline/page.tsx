import type { Metadata } from "next";
import { AdSlot } from "@/components/AdSlot";
import { getTimelinePage, parseTimelineFilters } from "@/lib/timeline";
import { TimelineClient } from "./TimelineClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Timeline" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toSearchParams(input: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      if (value[0]) params.set(key, value[0]);
    } else if (value) {
      params.set(key, value);
    }
  }

  return params;
}

export default async function TimelinePage({ searchParams }: PageProps) {
  const filters = parseTimelineFilters(toSearchParams(await searchParams));
  const page = await getTimelinePage(filters);

  return (
    <div className="rdgw-page-shell py-8">
      <section className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="rdgw-kicker">Timeline</span>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">Latest dare posts</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Browse crawled r/daresgonewild posts, Redgifs links, playbook completions, and community dares.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-400">
          Preview cards only. Media opens on Reddit or the source site.
        </div>
      </section>

      <TimelineClient
        initialItems={page.items}
        initialNextCursor={page.nextCursor}
        initialFilters={filters}
      />

      <AdSlot slotKey="home_banner" className="mx-auto mt-8 max-w-3xl" />
    </div>
  );
}
