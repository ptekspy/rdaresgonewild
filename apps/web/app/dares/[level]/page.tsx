import { getDb } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEVEL_LABELS, PLAYBOOK_DARES, type PlaybookLevel } from "@rdgw/playbook";

export const dynamic = "force-dynamic";

const NOT_REJECTED = { OR: [{ verified: true }, { verified: null }] };

interface PageProps {
  params: Promise<{ level: string }>;
}

function isPlaybookLevel(value: string): value is PlaybookLevel {
  return Object.prototype.hasOwnProperty.call(LEVEL_LABELS, value);
}

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

async function getLevelFromParams(params: PageProps["params"]) {
  const { level } = await params;
  if (!isPlaybookLevel(level)) notFound();
  return level;
}

async function getAttemptCountsByDare(level: PlaybookLevel) {
  const db = getDb();
  const levelSlugs = PLAYBOOK_DARES.filter((dare) => dare.level === level).map((dare) => dare.slug);
  const rows = await db.playbookCompletion.groupBy({
    by: ["dareSlug"],
    where: { ...NOT_REJECTED, dareSlug: { in: levelSlugs } },
    _count: { id: true },
  });

  return new Map(rows.map((row) => [row.dareSlug, row._count.id]));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const level = await getLevelFromParams(params);
  return { title: `${LEVEL_LABELS[level]} Dares` };
}

export default async function DareLevelPage({ params }: PageProps) {
  const level = await getLevelFromParams(params);
  const label = LEVEL_LABELS[level];
  const dares = PLAYBOOK_DARES.filter((dare) => dare.level === level);
  const attemptCounts = await getAttemptCountsByDare(level);
  const totalAttempts = dares.reduce((sum, dare) => sum + (attemptCounts.get(dare.slug) ?? 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="space-y-4">
        <Link href="/dares" className="text-sm text-zinc-500 hover:text-zinc-300">
          Back to all dares
        </Link>
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 font-mono">Level {dares[0]?.levelOrder ?? "-"}</p>
          <h1 className="text-3xl font-bold">{label} Dares</h1>
          <p className="text-zinc-400 text-sm">
            {fmtNumber(dares.length)} dares, {fmtNumber(totalAttempts)} tracked attempts.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {dares.map((dare) => {
          const attemptCount = attemptCounts.get(dare.slug) ?? 0;

          return (
            <Link
              key={dare.slug}
              href={`/dares/${level}/${dare.slug}`}
              className="group bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-red-900/80 hover:bg-zinc-900/80 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none">{dare.emoji}</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold text-white group-hover:text-red-400 transition-colors">
                      {dare.name}
                    </h2>
                    <span className="shrink-0 text-xs text-zinc-500">
                      #{dare.dareOrder}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 line-clamp-2">{dare.description}</p>
                  <p className="text-xs text-zinc-500">
                    {fmtNumber(attemptCount)} {attemptCount === 1 ? "attempt" : "attempts"}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
