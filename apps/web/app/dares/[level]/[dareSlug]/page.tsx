import { getDb } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEVEL_LABELS, PLAYBOOK_BY_SLUG, type PlaybookDare, type PlaybookLevel } from "@rdgw/playbook";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const NOT_REJECTED = { OR: [{ verified: true }, { verified: null }] };

interface PageProps {
  params: Promise<{ level: string; dareSlug: string }>;
  searchParams: Promise<{ page?: string }>;
}

type AttemptSummary = {
  id: string;
  username: string;
  detectedAt: Date;
  post: {
    title: string;
    permalink: string;
  };
};

function isPlaybookLevel(value: string): value is PlaybookLevel {
  return Object.prototype.hasOwnProperty.call(LEVEL_LABELS, value);
}

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

async function getDareFromParams(params: PageProps["params"]): Promise<PlaybookDare> {
  const { level, dareSlug } = await params;
  if (!isPlaybookLevel(level)) notFound();

  const dare = PLAYBOOK_BY_SLUG.get(dareSlug);
  if (!dare || dare.level !== level) notFound();

  return dare;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const dare = await getDareFromParams(params);
  return { title: `${dare.name} Attempts` };
}

export default async function DareAttemptsPage({ params, searchParams }: PageProps) {
  const dare = await getDareFromParams(params);
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const db = getDb();

  const [attempts, totalAttempts]: [AttemptSummary[], number] = await Promise.all([
    db.playbookCompletion.findMany({
      where: { ...NOT_REJECTED, dareSlug: dare.slug },
      orderBy: { detectedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        username: true,
        detectedAt: true,
        post: { select: { title: true, permalink: true } },
      },
    }),
    db.playbookCompletion.count({
      where: { ...NOT_REJECTED, dareSlug: dare.slug },
    }),
  ]);

  const totalPages = Math.ceil(totalAttempts / PAGE_SIZE);
  const levelLabel = LEVEL_LABELS[dare.level];

  return (
    <div className="rdgw-page-shell max-w-4xl py-10 space-y-8">
      <section className="rdgw-card-strong rdgw-glow-border overflow-hidden p-6 sm:p-8">
        <Link href={`/dares/${dare.level}`} className="rdgw-link text-sm font-bold">
          ← Back to {levelLabel} dares
        </Link>
        <div className="mt-5 flex items-start gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white/[0.07] text-4xl leading-none">
            {dare.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
              {levelLabel} #{dare.dareOrder}
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">{dare.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">{dare.description}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-pink-500/30 bg-pink-500/[0.12] px-3 py-1 text-xs font-bold text-pink-100">
            {fmtNumber(totalAttempts)} tracked {totalAttempts === 1 ? "attempt" : "attempts"}
          </span>
          <Link href="/dare-picker" className="rdgw-button-secondary px-4 py-2 text-sm">
            Find another dare
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-black text-white">Attempts</h2>
        <div className="rdgw-card overflow-hidden">
          {attempts.length === 0 ? (
            <p className="px-4 py-14 text-center text-sm text-zinc-500">No attempts yet.</p>
          ) : (
            <div className="divide-y divide-white/[0.08]">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="flex flex-col gap-2 px-4 py-4 text-sm sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${attempt.username}`} className="font-bold text-white transition hover:text-pink-200">
                      u/{attempt.username}
                    </Link>
                    <p className="mt-0.5 truncate text-zinc-500">{attempt.post.title}</p>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    <span className="text-xs text-zinc-600">{fmtDate(attempt.detectedAt)}</span>
                    <a
                      href={attempt.post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rdgw-link text-xs font-bold"
                    >
                      view post
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link href={`/dares/${dare.level}/${dare.slug}?page=${page - 1}`} className="rdgw-button-secondary px-4 py-2 text-sm">
              Prev
            </Link>
          )}
          <span className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-zinc-400">
            Page {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/dares/${dare.level}/${dare.slug}?page=${page + 1}`} className="rdgw-button-secondary px-4 py-2 text-sm">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
