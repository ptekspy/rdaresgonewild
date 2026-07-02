import { getDb } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PLAYBOOK_DARES, LEVEL_LABELS } from "@rdgw/playbook";
import { AdSlot } from "@/components/AdSlot";

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
  const rows = await db.playbookCompletion.groupBy({
    by: ["username"],
    where: NOT_REJECTED,
    _count: { dareSlug: true },
    orderBy: { _count: { dareSlug: "desc" } },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const total = await db.playbookCompletion.groupBy({
    by: ["username"],
    where: NOT_REJECTED,
    _count: { dareSlug: true },
  });
  return { rows, totalUsers: total.length };
}

async function getCommunityLeaderboard(page: number) {
  const db = getDb();
  const rows = await db.communityCompletion.groupBy({
    by: ["username"],
    where: NOT_REJECTED,
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const total = await db.communityCompletion.groupBy({
    by: ["username"],
    where: NOT_REJECTED,
    _count: { id: true },
  });
  return { rows, totalUsers: total.length };
}

async function getOverallLeaderboard(page: number) {
  const db = getDb();
  // Combine playbook + community counts via raw query
  const rows: Array<{ username: string; total: bigint }> = await db.$queryRaw`
    SELECT username, COUNT(*) as total FROM (
      SELECT username FROM "PlaybookCompletion" WHERE verified IS NOT FALSE
      UNION ALL
      SELECT username FROM "CommunityCompletion" WHERE verified IS NOT FALSE
    ) combined
    GROUP BY username
    ORDER BY total DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `;
  const countResult: Array<{ count: bigint }> = await db.$queryRaw`
    SELECT COUNT(DISTINCT username) as count FROM (
      SELECT username FROM "PlaybookCompletion" WHERE verified IS NOT FALSE
      UNION ALL
      SELECT username FROM "CommunityCompletion" WHERE verified IS NOT FALSE
    ) combined
  `;
  return {
    rows: rows.map((r) => ({ username: r.username, count: Number(r.total) })),
    totalUsers: Number(countResult[0]?.count ?? 0),
  };
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
    rows = data.rows.map((r: { username: any; _count: { dareSlug: any; }; }) => ({ username: r.username, count: r._count.dareSlug }));
    totalUsers = data.totalUsers;
  } else if (tab === "community") {
    const data = await getCommunityLeaderboard(page);
    rows = data.rows.map((r: { username: any; _count: { id: any; }; }) => ({ username: r.username, count: r._count.id }));
    totalUsers = data.totalUsers;
  } else {
    const data = await getOverallLeaderboard(page);
    rows = data.rows;
    totalUsers = data.totalUsers;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "playbook", label: "🎯 Playbook" },
    { key: "community", label: "🤝 Community" },
    { key: "overall", label: "🏆 Overall" },
  ];

  const totalPages = Math.ceil(totalUsers / PAGE_SIZE);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Leaderboard</h1>
        <p className="text-zinc-400 text-sm">{totalUsers} creators ranked</p>
      </div>

      <AdSlot slotKey="leaderboard_banner" />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 pb-0">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/leaderboard?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-red-500 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-left">
              <th className="px-4 py-3 w-12">#</th>
              <th className="px-4 py-3">Creator</th>
              <th className="px-4 py-3 text-right">
                {tab === "playbook" ? "Dares completed" : tab === "community" ? "Community dares" : "Total dares"}
              </th>
              {tab === "playbook" && <th className="px-4 py-3 text-right">Progress</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-zinc-500">
                  No data yet.
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const rank = (page - 1) * PAGE_SIZE + i + 1;
              const pct = tab === "playbook" ? Math.round((r.count / totalDares) * 100) : null;
              return (
                <tr key={r.username} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 text-zinc-500 font-mono">{rank}</td>
                  <td className="px-4 py-3">
                    <Link href={`/u/${r.username}`} className="hover:text-red-400 transition-colors">
                      u/{r.username}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{r.count}</td>
                  {tab === "playbook" && (
                    <td className="px-4 py-3 text-right">
                      <span className="text-zinc-500">{pct}%</span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link href={`/leaderboard?tab=${tab}&page=${page - 1}`} className="px-3 py-1.5 text-sm border border-zinc-700 rounded hover:bg-zinc-800 transition-colors">
              ← Prev
            </Link>
          )}
          <span className="px-3 py-1.5 text-sm text-zinc-500">
            Page {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/leaderboard?tab=${tab}&page=${page + 1}`} className="px-3 py-1.5 text-sm border border-zinc-700 rounded hover:bg-zinc-800 transition-colors">
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
