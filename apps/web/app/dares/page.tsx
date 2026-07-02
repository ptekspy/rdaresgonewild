import { getDb } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { LEVEL_LABELS, PLAYBOOK_DARES, type PlaybookLevel } from "@rdgw/playbook";

export const metadata: Metadata = { title: "The Playbook" };
export const dynamic = "force-dynamic";

const NOT_REJECTED = { OR: [{ verified: true }, { verified: null }] };

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

async function getAttemptCountsByLevel() {
  const db = getDb();
  const rows = await db.playbookCompletion.groupBy({
    by: ["dareSlug"],
    where: NOT_REJECTED,
    _count: { id: true },
  });

  const counts = new Map<PlaybookLevel, number>();
  for (const row of rows) {
    const dare = PLAYBOOK_DARES.find((item) => item.slug === row.dareSlug);
    if (!dare) continue;
    counts.set(dare.level, (counts.get(dare.level) ?? 0) + row._count.id);
  }

  return counts;
}

export default async function AllDaresPage() {
  const attemptCountsByLevel = await getAttemptCountsByLevel();

  return (
    <div className="rdgw-page-shell py-10 space-y-8">
      <section className="rdgw-card-strong rdgw-glow-border overflow-hidden p-6 sm:p-8">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-4">
            <span className="rdgw-kicker">Official playbook</span>
            <div>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                The <span className="rdgw-gradient-text">Playbook</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
                Browse official dares by level, track attempts, and find the next milestone in the progression.
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.045] px-5 py-4 text-right">
            <p className="text-3xl font-black text-white">{fmtNumber(PLAYBOOK_DARES.length)}</p>
            <p className="text-xs uppercase tracking-wider text-zinc-500">official dares</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(LEVEL_LABELS).map(([level, label]) => {
          const dares = PLAYBOOK_DARES.filter((dare) => dare.level === level);
          const attemptCount = attemptCountsByLevel.get(level as PlaybookLevel) ?? 0;
          const levelOrder = dares[0]?.levelOrder ?? "-";

          return (
            <Link
              key={level}
              href={`/dares/${level}`}
              className="group rdgw-card p-5 transition hover:-translate-y-0.5 hover:border-pink-500/[0.35]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Level {levelOrder}</p>
                  <h2 className="mt-1 text-xl font-black text-white transition group-hover:text-pink-100">
                    {label}
                  </h2>
                </div>
                <span className="rounded-full bg-white/[0.07] px-3 py-1 text-xs font-bold text-zinc-300 transition group-hover:bg-pink-500/[0.12] group-hover:text-pink-100">
                  View
                </span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-3">
                  <p className="text-2xl font-black text-white">{fmtNumber(dares.length)}</p>
                  <p className="text-xs text-zinc-500">dares</p>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-3">
                  <p className="text-2xl font-black text-white">{fmtNumber(attemptCount)}</p>
                  <p className="text-xs text-zinc-500">attempts</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
