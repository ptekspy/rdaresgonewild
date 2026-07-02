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
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <div className="space-y-4">
        <Link href={`/dares/${dare.level}`} className="text-sm text-zinc-500 hover:text-zinc-300">
          Back to {levelLabel} dares
        </Link>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-3xl leading-none">{dare.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-zinc-500 font-mono">
                {levelLabel} #{dare.dareOrder}
              </p>
              <h1 className="text-3xl font-bold">{dare.name}</h1>
            </div>
          </div>
          <p className="text-zinc-400 text-sm max-w-2xl">{dare.description}</p>
          <p className="text-sm text-zinc-500">
            {fmtNumber(totalAttempts)} tracked {totalAttempts === 1 ? "attempt" : "attempts"}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Attempts</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {attempts.length === 0 ? (
            <p className="px-4 py-12 text-center text-zinc-500 text-sm">
              No attempts yet.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${attempt.username}`} className="font-medium text-white hover:text-red-400 transition-colors">
                      u/{attempt.username}
                    </Link>
                    <p className="text-zinc-500 truncate mt-0.5">{attempt.post.title}</p>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    <span className="text-xs text-zinc-600">{fmtDate(attempt.detectedAt)}</span>
                    <a
                      href={attempt.post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
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
            <Link href={`/dares/${dare.level}/${dare.slug}?page=${page - 1}`} className="px-3 py-1.5 text-sm border border-zinc-700 rounded hover:bg-zinc-800 transition-colors">
              Prev
            </Link>
          )}
          <span className="px-3 py-1.5 text-sm text-zinc-500">
            Page {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/dares/${dare.level}/${dare.slug}?page=${page + 1}`} className="px-3 py-1.5 text-sm border border-zinc-700 rounded hover:bg-zinc-800 transition-colors">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
