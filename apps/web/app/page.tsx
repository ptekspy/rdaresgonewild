import { getDb } from "@/lib/db";
import { PLAYBOOK_DARES, LEVEL_LABELS } from "@rdgw/playbook";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { HomePlayerDashboard } from "@/components/HomePlayerDashboard";

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

async function getTopCreators(limit = 8) {
  const db = getDb();
  const rows = await db.playbookCompletion.groupBy({
    by: ["username"],
    where: NOT_REJECTED,
    _count: { dareSlug: true },
    orderBy: { _count: { dareSlug: "desc" } },
    take: limit,
  });
  return rows.map((r: { username: string; _count: { dareSlug: number } }, i: number) => ({
    rank: i + 1,
    username: r.username,
    count: r._count.dareSlug,
  }));
}

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function HomePage() {
  const [stats, topCreators] = await Promise.all([getStats(), getTopCreators()]);
  const totalDares = PLAYBOOK_DARES.length;

  return (
    <div className="rdgw-page-shell py-4 sm:py-8">
      <section className="rdgw-card-strong rdgw-glow-border relative isolate overflow-hidden px-5 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-orange-500/[0.18] blur-3xl" />
        <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-pink-600/20 blur-3xl" />

        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative z-10 space-y-7">
            <span className="rdgw-kicker">Unofficial r/daresgonewild tracker</span>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
                Track dares. <span className="rdgw-gradient-text">Level up.</span> Get wild.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-zinc-300">
                {totalDares} official playbook dares across 13 levels. Follow progress, compare creators, and pick the next challenge waiting for you.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/dare-picker" className="rdgw-button-primary px-6 py-3 text-sm">
                Pick my next dare
              </Link>
              <Link href="/leaderboard" className="rdgw-button-secondary px-6 py-3 text-sm">
                View leaderboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-8">
        <HomePlayerDashboard />
      </div>

      <AdSlot slotKey="home_banner" className="mx-auto mt-8 max-w-3xl" />

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Creators tracked", value: fmtNumber(stats.userCount), icon: "👤" },
          { label: "Playbook completions", value: fmtNumber(stats.playbookCount), icon: "✅" },
          { label: "Community dares", value: fmtNumber(stats.communityCount), icon: "🔥" },
        ].map((stat) => (
          <div key={stat.label} className="rdgw-card p-5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.07] text-xl">
              {stat.icon}
            </div>
            <p className="text-3xl font-black text-white">{stat.value}</p>
            <p className="mt-1 text-sm text-zinc-400">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-14 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rdgw-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="rdgw-kicker">Leaderboard</p>
              <h2 className="mt-3 text-2xl font-black text-white">Top creators</h2>
            </div>
            <Link href="/leaderboard" className="rdgw-link text-sm font-bold">
              Full board →
            </Link>
          </div>

          <div className="mt-6 space-y-2">
            {topCreators.length === 0 && (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-zinc-500">
                No data yet — check back after the first crawl.
              </p>
            )}
            {topCreators.map((creator) => {
              const pct = Math.round((creator.count / totalDares) * 100);
              return (
                <Link
                  key={creator.username}
                  href={`/u/${creator.username}`}
                  className="group block rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:border-pink-500/40 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] font-mono text-sm text-zinc-300">
                      #{creator.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-white transition group-hover:text-pink-200">u/{creator.username}</p>
                      <div className="mt-2 rdgw-progress h-2">
                        <div className="rdgw-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-right text-sm text-zinc-400">
                      {creator.count}/{totalDares}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rdgw-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="rdgw-kicker">Playbook</p>
              <h2 className="mt-3 text-2xl font-black text-white">The 13 levels</h2>
            </div>
            <Link href="/dares" className="rdgw-link text-sm font-bold">
              Browse all →
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {Object.entries(LEVEL_LABELS).map(([key, label], index) => {
              const count = PLAYBOOK_DARES.filter((dare: { level: string }) => dare.level === key).length;
              return (
                <Link
                  key={key}
                  href={`/dares/${key}`}
                  className="group rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 transition hover:border-orange-400/40 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Level {index + 1}</p>
                      <p className="mt-1 font-bold text-zinc-100 group-hover:text-white">{label}</p>
                    </div>
                    <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-xs font-bold text-zinc-300">{count}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
