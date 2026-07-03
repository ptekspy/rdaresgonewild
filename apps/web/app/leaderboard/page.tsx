import { getDb } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PLAYBOOK_DARES } from "@rdgw/playbook";
import { AdSlot } from "@/components/AdSlot";
import { LeaderboardPersonalization } from "@/components/LeaderboardPersonalization";
import { getSiteConfig } from "@/lib/site";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

type Tab = "overall" | "playbook" | "community";

interface PageProps {
  searchParams: Promise<{ tab?: string; page?: string }>;
}

const PAGE_SIZE = 50;
const NOT_REJECTED = { OR: [{ verified: true }, { verified: null }] };

async function getPlaybookLeaderboard(page: number) {
  const db = getDb();
  const site = getSiteConfig();
  const rows = await db.playbookCompletion.groupBy({
    by: ["username"],
    where: { ...NOT_REJECTED, post: { subreddit: site.subreddit } },
    _count: { dareSlug: true },
    orderBy: { _count: { dareSlug: "desc" } },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const total = await db.playbookCompletion.groupBy({
    by: ["username"],
    where: { ...NOT_REJECTED, post: { subreddit: site.subreddit } },
    _count: { dareSlug: true },
  });
  return { rows, totalUsers: total.length };
}

async function getCommunityLeaderboard(page: number) {
  const db = getDb();
  const site = getSiteConfig();
  const rows = await db.communityCompletion.groupBy({
    by: ["username"],
    where: { ...NOT_REJECTED, post: { subreddit: site.subreddit } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const total = await db.communityCompletion.groupBy({
    by: ["username"],
    where: { ...NOT_REJECTED, post: { subreddit: site.subreddit } },
    _count: { id: true },
  });
  return { rows, totalUsers: total.length };
}

async function getOverallLeaderboard(page: number) {
  const db = getDb();
  const site = getSiteConfig();
  const rows: Array<{ username: string; total: bigint }> = await db.$queryRaw`
    SELECT username, COUNT(*) as total FROM (
      SELECT pc.username
      FROM "PlaybookCompletion" pc
      JOIN "DgwPost" p ON p.id = pc."postId"
      WHERE pc.verified IS NOT FALSE AND p.subreddit = ${site.subreddit}
      UNION ALL
      SELECT cc.username
      FROM "CommunityCompletion" cc
      JOIN "DgwPost" p ON p.id = cc."postId"
      WHERE cc.verified IS NOT FALSE AND p.subreddit = ${site.subreddit}
    ) combined
    GROUP BY username
    ORDER BY total DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `;
  const countResult: Array<{ count: bigint }> = await db.$queryRaw`
    SELECT COUNT(DISTINCT username) as count FROM (
      SELECT pc.username
      FROM "PlaybookCompletion" pc
      JOIN "DgwPost" p ON p.id = pc."postId"
      WHERE pc.verified IS NOT FALSE AND p.subreddit = ${site.subreddit}
      UNION ALL
      SELECT cc.username
      FROM "CommunityCompletion" cc
      JOIN "DgwPost" p ON p.id = cc."postId"
      WHERE cc.verified IS NOT FALSE AND p.subreddit = ${site.subreddit}
    ) combined
  `;
  return {
    rows: rows.map((r) => ({ username: r.username, count: Number(r.total) })),
    totalUsers: Number(countResult[0]?.count ?? 0),
  };
}

function getRankBadge(rank: number) {
  if (rank === 1) return "bg-gradient-to-br from-yellow-300 to-orange-500 text-zinc-950";
  if (rank === 2) return "bg-gradient-to-br from-zinc-200 to-zinc-500 text-zinc-950";
  if (rank === 3) return "bg-gradient-to-br from-orange-300 to-amber-700 text-zinc-950";
  return "bg-white/[0.07] text-zinc-300";
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab: Tab = (params.tab as Tab) || "playbook";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const totalDares = PLAYBOOK_DARES.length;

  let rows: Array<{ username: string; count: number }> = [];
  let totalUsers = 0;

  if (tab === "playbook") {
    const data = await getPlaybookLeaderboard(page);
    rows = data.rows.map((r: { username: string; _count: { dareSlug: number } }) => ({ username: r.username, count: r._count.dareSlug }));
    totalUsers = data.totalUsers;
  } else if (tab === "community") {
    const data = await getCommunityLeaderboard(page);
    rows = data.rows.map((r: { username: string; _count: { id: number } }) => ({ username: r.username, count: r._count.id }));
    totalUsers = data.totalUsers;
  } else {
    const data = await getOverallLeaderboard(page);
    rows = data.rows;
    totalUsers = data.totalUsers;
  }

  const tabs: { key: Tab; label: string; helper: string }[] = [
    { key: "playbook", label: "Playbook", helper: "official progression" },
    { key: "community", label: "Community", helper: "creator dares" },
    { key: "overall", label: "Overall", helper: "combined score" },
  ];

  const totalPages = Math.ceil(totalUsers / PAGE_SIZE);

  return (
    <div className="rdgw-page-shell py-10 space-y-8">
      <section className="rdgw-card-strong rdgw-glow-border overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-4">
            <span className="rdgw-kicker">Compete · climb higher</span>
            <div>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                <span className="rdgw-gradient-text">Leaderboard</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
                Track top creators, compare dare completions, and see who is keeping the fire burning.
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.045] px-5 py-4 text-right">
            <p className="text-3xl font-black text-white">{totalUsers}</p>
            <p className="text-xs uppercase tracking-wider text-zinc-500">creators ranked</p>
          </div>
        </div>
      </section>

      <AdSlot slotKey="leaderboard_banner" />

      <LeaderboardPersonalization visibleUsernames={rows.map((row) => row.username)} tab={tab} />

      <div className="grid gap-3 md:grid-cols-3">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/leaderboard?tab=${t.key}`}
              className={`rounded-3xl border p-4 transition ${
                active
                  ? "border-pink-500/50 bg-pink-500/[0.12] shadow-[0_0_34px_rgba(249,4,124,0.16)]"
                  : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.055]"
              }`}
            >
              <p className={`font-black ${active ? "rdgw-gradient-text" : "text-white"}`}>{t.label}</p>
              <p className="mt-1 text-xs text-zinc-500">{t.helper}</p>
            </Link>
          );
        })}
      </div>

      <div className="rdgw-card overflow-hidden">
        <div className="hidden grid-cols-[72px_1fr_160px_130px] border-b border-white/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500 md:grid">
          <div>#</div>
          <div>Creator</div>
          <div className="text-right">
            {tab === "playbook" ? "Dares completed" : tab === "community" ? "Community dares" : "Total dares"}
          </div>
          <div className="text-right">{tab === "playbook" ? "Progress" : "Score"}</div>
        </div>

        <div className="divide-y divide-white/[0.08]">
          {rows.length === 0 && (
            <p className="px-4 py-14 text-center text-sm text-zinc-500">No data yet.</p>
          )}

          {rows.map((row, index) => {
            const rank = (page - 1) * PAGE_SIZE + index + 1;
            const pct = tab === "playbook" ? Math.round((row.count / totalDares) * 100) : null;
            return (
              <Link
                key={row.username}
                href={`/u/${row.username}`}
                data-leaderboard-username={row.username.toLowerCase()}
                className="grid gap-3 px-4 py-4 transition hover:bg-white/[0.045] md:grid-cols-[72px_1fr_160px_130px] md:items-center md:px-5"
              >
                <div className="flex items-center gap-3 md:block">
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-black ${getRankBadge(rank)}`}>
                    {rank}
                  </span>
                  <span className="font-bold text-white md:hidden">u/{row.username}</span>
                </div>
                <div className="hidden min-w-0 md:block">
                  <p className="truncate font-bold text-white">u/{row.username}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">view creator profile</p>
                </div>
                <div className="text-left font-mono text-sm text-zinc-200 md:text-right">{row.count}</div>
                <div className="space-y-1 md:text-right">
                  {tab === "playbook" ? (
                    <>
                      <div className="rdgw-progress h-2">
                        <div className="rdgw-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-zinc-500">{pct}%</p>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-500">rank score</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link href={`/leaderboard?tab=${tab}&page=${page - 1}`} className="rdgw-button-secondary px-4 py-2 text-sm">
              ← Prev
            </Link>
          )}
          <span className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-zinc-400">
            Page {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/leaderboard?tab=${tab}&page=${page + 1}`} className="rdgw-button-secondary px-4 py-2 text-sm">
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
