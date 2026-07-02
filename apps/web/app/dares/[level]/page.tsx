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
    <div className="rdgw-page-shell py-10 space-y-8">
      <section className="rdgw-card-strong rdgw-glow-border overflow-hidden p-6 sm:p-8">
        <Link href="/dares" className="rdgw-link text-sm font-bold">
          ← Back to playbook
        </Link>
        <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Level {dares[0]?.levelOrder ?? "-"}</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
              <span className="rdgw-gradient-text">{label}</span> Dares
            </h1>
            <p className="mt-3 text-sm text-zinc-300">
              {fmtNumber(dares.length)} dares, {fmtNumber(totalAttempts)} tracked attempts.
            </p>
          </div>
          <Link href="/dare-picker" className="rdgw-button-primary px-5 py-2.5 text-sm">
            Pick from this playbook
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {dares.map((dare) => {
          const attemptCount = attemptCounts.get(dare.slug) ?? 0;

          return (
            <Link
              key={dare.slug}
              href={`/dares/${level}/${dare.slug}`}
              className="group rdgw-card p-5 transition hover:-translate-y-0.5 hover:border-pink-500/[0.35]"
            >
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.07] text-2xl leading-none">
                  {dare.emoji}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-black text-white transition group-hover:text-pink-100">
                      {dare.name}
                    </h2>
                    <span className="shrink-0 rounded-full bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-400">
                      #{dare.dareOrder}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm leading-6 text-zinc-400">{dare.description}</p>
                  <p className="text-xs font-semibold text-zinc-500">
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
