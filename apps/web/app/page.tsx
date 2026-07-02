import { getDb } from "@/lib/db";
import { PLAYBOOK_DARES, LEVEL_LABELS } from "@rdgw/playbook";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";

export const dynamic = "force-dynamic";

const NOT_REJECTED = { OR: [{ verified: true }, { verified: null }] };

async function getStats() {
  const db = getDb();
  const [userCount, playbookCount, communityCount] = await Promise.all([
    db.dgwUser.count(),
    db.playbookCompletion.count({ where: NOT_REJECTED }),
    db.communityCompletion.count({ where: NOT_REJECTED }),
  ]);
  return { userCount, playbookCount, communityCount };
}

async function getTopCreators(limit = 10) {
  const db = getDb();
  const rows = await db.playbookCompletion.groupBy({
    by: ["username"],
    where: NOT_REJECTED,
    _count: { dareSlug: true },
    orderBy: { _count: { dareSlug: "desc" } },
    take: limit,
  });
  return rows.map((r: { username: any; _count: { dareSlug: any; }; }, i: number) => ({ rank: i + 1, username: r.username, count: r._count.dareSlug }));
}

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function HomePage() {
  const [stats, topCreators] = await Promise.all([getStats(), getTopCreators()]);
  const totalDares = PLAYBOOK_DARES.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-16">
      {/* Hero */}
      <section className="text-center space-y-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          Track Your <span className="text-red-500">Dare Journey</span>
        </h1>
        <p className="text-zinc-400 text-lg max-w-xl mx-auto">
          {totalDares} official playbook dares across 13 levels. See who's completed the most, and get your next challenge.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link href="/dare-picker" className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg transition-colors text-sm">
            🎲 Pick My Next Dare
          </Link>
          <Link href="/leaderboard" className="px-6 py-3 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white rounded-lg transition-colors text-sm">
            🏆 View Leaderboard
          </Link>
        </div>
      </section>

      {/* Ad slot */}
      <AdSlot slotKey="home_banner" className="max-w-3xl mx-auto" />

      {/* Stats bar */}
      <section className="grid grid-cols-3 gap-4 text-center">
        {[
          { label: "Creators tracked", value: fmtNumber(stats.userCount) },
          { label: "Playbook completions", value: fmtNumber(stats.playbookCount) },
          { label: "Community dares", value: fmtNumber(stats.communityCount) },
        ].map((s) => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-2xl font-bold text-white">{s.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Top creators preview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">🏆 Top Creators</h2>
          <Link href="/leaderboard" className="text-sm text-red-500 hover:text-red-400">
            Full leaderboard →
          </Link>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
          {topCreators.length === 0 && (
            <p className="px-4 py-8 text-center text-zinc-500 text-sm">No data yet — check back after the first crawl.</p>
          )}
          {topCreators.map((c: { username: any; rank: any; count: any; }) => (
            <Link
              key={c.username}
              href={`/u/${c.username}`}
              className="flex items-center px-4 py-3 hover:bg-zinc-800/50 transition-colors gap-4"
            >
              <span className="w-8 text-zinc-500 text-sm font-mono">#{c.rank}</span>
              <span className="flex-1 font-medium">u/{c.username}</span>
              <span className="text-sm text-zinc-400">{c.count} / {totalDares} dares</span>
              <span className="text-xs text-zinc-600">→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Level overview */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">📋 The 13 Levels</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(LEVEL_LABELS).map(([key, label], i) => {
            const count = PLAYBOOK_DARES.filter((d: { level: string; }) => d.level === key).length;
            return (
              <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm">
                <span className="text-zinc-500 font-mono mr-2">L{i + 1}</span>
                <span className="text-zinc-200">{label}</span>
                <span className="float-right text-zinc-600">{count}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
