import { getDb } from "@/lib/db";
import { PLAYBOOK_DARES, LEVEL_LABELS } from "@rdgw/playbook";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { HomePlayerDashboard } from "@/components/HomePlayerDashboard";
import { HeroDareChat } from "@/components/HeroDareChat";
import { RedditPostCard } from "@/components/RedditPostCard";
import { getBoardPosts, getBoardStats, getTopBoardCreators } from "@/lib/board";
import { getSiteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

const NOT_REJECTED = { OR: [{ verified: true }, { verified: null }] };

async function getStats() {
  const db = getDb();
  const site = getSiteConfig();
  const [userCount, playbookCount, communityCount] = await Promise.all([
    db.dgwUser.count({ where: { posts: { some: { subreddit: site.subreddit } } } }),
    db.playbookCompletion.count({ where: { ...NOT_REJECTED, post: { subreddit: site.subreddit } } }),
    db.communityCompletion.count({ where: { ...NOT_REJECTED, post: { subreddit: site.subreddit } } }),
  ]);
  return { userCount, playbookCount, communityCount };
}

async function getTopCreators(limit = 8) {
  const db = getDb();
  const site = getSiteConfig();
  const rows = await db.playbookCompletion.groupBy({
    by: ["username"],
    where: { ...NOT_REJECTED, post: { subreddit: site.subreddit } },
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
  const site = getSiteConfig();
  if (site.mode === "reddit-board") {
    return <BoardHomePage />;
  }

  const [stats, topCreators] = await Promise.all([getStats(), getTopCreators()]);
  const totalDares = PLAYBOOK_DARES.length;

  return (
    <div className="rdgw-page-shell py-4 sm:py-8">
      <section className="rdgw-card-strong rdgw-glow-border relative isolate overflow-hidden px-5 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-orange-500/[0.18] blur-3xl" />
        <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-pink-600/20 blur-3xl" />

        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
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

          <div className="relative z-10">
            <HeroDareChat />
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

async function BoardHomePage() {
  const site = getSiteConfig();
  const board = site.board;
  if (!board) return null;

  const [stats, latestPosts, topPosts, topCreators] = await Promise.all([
    getBoardStats(),
    getBoardPosts({ sort: "new", limit: 8 }),
    getBoardPosts({ sort: "top", topWindow: "month", limit: 8 }),
    getTopBoardCreators(6),
  ]);

  return (
    <div className="rdgw-page-shell py-4 sm:py-8">
      <section className="rdgw-card-strong rdgw-glow-border relative isolate overflow-hidden px-5 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-pink-500/[0.18] blur-3xl" />
        <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-cyan-500/[0.14] blur-3xl" />

        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative z-10 space-y-7">
            <span className="rdgw-kicker">{board.kicker}</span>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
                {board.headline} <span className="rdgw-gradient-text">{board.accent}</span>
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-zinc-300">{board.intro}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/new" className="rdgw-button-primary px-6 py-3 text-sm">
                {board.primaryCta}
              </Link>
              <Link href="/top/month" className="rdgw-button-secondary px-6 py-3 text-sm">
                Top this month
              </Link>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-3">
            {latestPosts.slice(0, 4).map((post) => (
              <RedditPostCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      </section>

      <AdSlot slotKey="home_banner" className="mx-auto mt-8 max-w-3xl" />

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Posts indexed", value: fmtNumber(stats.postCount) },
          { label: "Creators tracked", value: fmtNumber(stats.creatorCount) },
          { label: "Tags live", value: fmtNumber(board.tags.length) },
        ].map((stat) => (
          <div key={stat.label} className="rdgw-card p-5">
            <p className="text-3xl font-black text-white">{stat.value}</p>
            <p className="mt-1 text-sm text-zinc-400">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-14 space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="rdgw-kicker">Fresh feed</p>
            <h2 className="mt-3 text-2xl font-black text-white">Newest posts</h2>
          </div>
          <Link href="/new" className="rdgw-link text-sm font-bold">
            View all
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {latestPosts.map((post) => (
            <RedditPostCard key={post.id} post={post} />
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="rdgw-kicker">Top month</p>
              <h2 className="mt-3 text-2xl font-black text-white">Most active posts</h2>
            </div>
            <Link href="/top/month" className="rdgw-link text-sm font-bold">
              More top posts
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {topPosts.slice(0, 4).map((post) => (
              <RedditPostCard key={post.id} post={post} />
            ))}
          </div>
        </div>

        <div className="rdgw-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="rdgw-kicker">Creators</p>
              <h2 className="mt-3 text-2xl font-black text-white">Most posts</h2>
            </div>
            <Link href="/creators" className="rdgw-link text-sm font-bold">
              Full list
            </Link>
          </div>

          <div className="mt-6 space-y-2">
            {topCreators.length === 0 && (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-zinc-500">
                No data yet.
              </p>
            )}
            {topCreators.map((creator, index) => (
              <Link
                key={creator.authorUsername}
                href={`/u/${creator.authorUsername}`}
                className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:border-pink-500/40 hover:bg-white/[0.06]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] font-mono text-sm text-zinc-300">
                  #{index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold text-white">u/{creator.authorUsername}</span>
                <span className="text-right text-sm text-zinc-400">{creator._count.id}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-14 space-y-5">
        <div>
          <p className="rdgw-kicker">Tags</p>
          <h2 className="mt-3 text-2xl font-black text-white">Browse by setting</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {board.tags.map((tag) => (
            <Link key={tag.slug} href={`/tags/${tag.slug}`} className="rdgw-button-secondary px-4 py-2 text-sm">
              {tag.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
