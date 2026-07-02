import { getDb } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { LEVEL_LABELS, PLAYBOOK_DARES, type PlaybookLevel } from "@rdgw/playbook";

export const metadata: Metadata = { title: "All Dares" };
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
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">All Dares</h1>
        <p className="text-zinc-400 text-sm">
          Browse the official playbook by level and see every tracked attempt.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(LEVEL_LABELS).map(([level, label]) => {
          const dares = PLAYBOOK_DARES.filter((dare) => dare.level === level);
          const attemptCount = attemptCountsByLevel.get(level as PlaybookLevel) ?? 0;

          return (
            <Link
              key={level}
              href={`/dares/${level}`}
              className="group bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-red-900/80 hover:bg-zinc-900/80 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-zinc-500 font-mono">Level {dares[0]?.levelOrder ?? "-"}</p>
                  <h2 className="text-lg font-semibold text-white group-hover:text-red-400 transition-colors">
                    {label}
                  </h2>
                </div>
                <span className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors">View</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xl font-bold">{fmtNumber(dares.length)}</p>
                  <p className="text-xs text-zinc-500">dares</p>
                </div>
                <div>
                  <p className="text-xl font-bold">{fmtNumber(attemptCount)}</p>
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
