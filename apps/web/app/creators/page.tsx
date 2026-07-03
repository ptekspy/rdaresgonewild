import { getTopBoardCreators } from "@/lib/board";
import { getSiteConfig } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Creators" };
export const dynamic = "force-dynamic";

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function CreatorsPage() {
  const site = getSiteConfig();
  if (site.mode !== "reddit-board") notFound();

  const creators = await getTopBoardCreators(100);

  return (
    <div className="rdgw-page-shell py-10 space-y-8">
      <section className="space-y-4">
        <span className="rdgw-kicker">{site.subredditDisplay}</span>
        <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">Creators</h1>
      </section>

      <div className="rdgw-card overflow-hidden">
        <div className="hidden grid-cols-[72px_1fr_160px_160px] border-b border-white/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500 md:grid">
          <div>#</div>
          <div>Creator</div>
          <div className="text-right">Posts</div>
          <div className="text-right">Score</div>
        </div>

        <div className="divide-y divide-white/[0.08]">
          {creators.length === 0 && <p className="px-4 py-14 text-center text-sm text-zinc-500">No creators indexed yet.</p>}
          {creators.map((creator, index) => (
            <Link
              key={creator.authorUsername}
              href={`/u/${creator.authorUsername}`}
              className="grid gap-3 px-4 py-4 transition hover:bg-white/[0.045] md:grid-cols-[72px_1fr_160px_160px] md:items-center md:px-5"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] text-sm font-black text-zinc-300">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold text-white">u/{creator.authorUsername}</p>
                <p className="mt-0.5 text-xs text-zinc-500">view posts</p>
              </div>
              <div className="font-mono text-sm text-zinc-200 md:text-right">{fmtNumber(creator._count.id)}</div>
              <div className="font-mono text-sm text-zinc-400 md:text-right">{fmtNumber(creator._sum.score ?? 0)}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
