import { prisma } from "@rdgw/database";
import { PLAYBOOK_DARES } from "@rdgw/playbook";
import Link from "next/link";
import { formatDateTime, formatNumber, formatPercent, statusClass } from "./admin-format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

type RecentCrawlRun = {
  id: string;
  type: string;
  target: string;
  status: string;
  postsFound: number;
  completionsDetected: number;
  startedAt: Date;
};

export default async function AdminDashboard() {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const [
    userCount,
    postCount,
    subredditStats,
    playbookCount,
    communityCount,
    pendingReview,
    activeBookings,
    totalImpressions,
    totalClicks,
    weekImpressions,
    weekClicks,
    recentPosts,
    recentRuns,
  ] = await Promise.all([
    prisma.dgwUser.count(),
    prisma.dgwPost.count(),
    prisma.dgwPost.groupBy({
      by: ["subreddit"],
      _count: { _all: true },
    }),
    prisma.playbookCompletion.count(),
    prisma.communityCompletion.count(),
    Promise.all([
      prisma.playbookCompletion.count({ where: { verified: null } }),
      prisma.communityCompletion.count({ where: { verified: null } }),
    ]).then(([playbookPending, communityPending]) => playbookPending + communityPending),
    prisma.booking.count({
      where: {
        enabled: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        campaign: { status: { in: ["ACTIVE", "SCHEDULED"] } },
        creative: { status: "APPROVED" },
      },
    }),
    prisma.adImpression.count(),
    prisma.adClick.count(),
    prisma.adImpression.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.adClick.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.dgwPost.findMany({
      orderBy: { createdAtReddit: "desc" },
      take: 8,
      select: {
        id: true,
        subreddit: true,
        authorUsername: true,
        title: true,
        score: true,
        commentCount: true,
        createdAtReddit: true,
        permalink: true,
      },
    }),
    prisma.crawlRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
  ]);

  const typedRecentRuns = recentRuns as RecentCrawlRun[];
  const subredditCount = subredditStats.length;

  const stats = [
    { label: "Posts", value: postCount, href: "/posts" },
    { label: "Users", value: userCount, href: "/users" },
    { label: "Subreddits", value: subredditCount, href: "/subreddits" },
    { label: "Active ads", value: activeBookings, href: "/ads" },
    { label: "Pending dares", value: pendingReview, href: "/dares", urgent: pendingReview > 0 },
    { label: "Total impressions", value: totalImpressions, href: "/ads" },
    { label: "Total clicks", value: totalClicks, href: "/ads" },
    { label: "7 day CTR", value: formatPercent(weekClicks, weekImpressions), href: "/ads", formatted: true },
    { label: "Playbook dares", value: playbookCount },
    { label: "Community dares", value: communityCount },
    { label: "Dares in playbook", value: PLAYBOOK_DARES.length },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">Content ingestion, subreddit coverage, and Paid Politely Ads at a glance.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/ads" className="button-primary">New ad</Link>
          <Link href="/posts" className="button-secondary">View posts</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href ?? "#"}
            className={`admin-card p-4 transition-colors ${s.href ? "hover:border-zinc-600" : "pointer-events-none"} ${s.urgent ? "border-yellow-700 bg-yellow-950/30" : ""}`}
          >
            <p className="text-2xl font-bold">{s.formatted ? s.value : formatNumber(s.value as number)}</p>
            <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent posts</h2>
            <Link href="/posts" className="text-sm text-zinc-400 hover:text-white">Open list</Link>
          </div>
          <div className="admin-card overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Post</th>
                  <th>Subreddit</th>
                  <th>Score</th>
                  <th>Comments</th>
                  <th>Posted</th>
                </tr>
              </thead>
              <tbody>
                {recentPosts.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <a className="font-medium text-zinc-100 hover:text-white" href={`https://reddit.com${post.permalink}`} target="_blank" rel="noreferrer">
                        {post.title}
                      </a>
                      <p className="mt-1 text-xs text-zinc-500">u/{post.authorUsername}</p>
                    </td>
                    <td className="text-zinc-300">r/{post.subreddit}</td>
                    <td>{formatNumber(post.score)}</td>
                    <td>{formatNumber(post.commentCount)}</td>
                    <td className="text-xs text-zinc-500">{formatDateTime(post.createdAtReddit)}</td>
                  </tr>
                ))}
                {recentPosts.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-zinc-600">No posts yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent crawl runs</h2>
            <Link href="/crawler" className="text-sm text-zinc-400 hover:text-white">Run crawler</Link>
          </div>
          <div className="admin-card overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th>Posts</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {typedRecentRuns.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-xs text-zinc-400">{r.type}</td>
                    <td>{r.target}</td>
                    <td><span className={statusClass(r.status)}>{r.status}</span></td>
                    <td>{formatNumber(r.postsFound)}</td>
                    <td className="text-xs text-zinc-500">{formatDateTime(r.startedAt)}</td>
                  </tr>
                ))}
                {typedRecentRuns.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-zinc-600">No crawl runs yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

    </div>
  );
}
