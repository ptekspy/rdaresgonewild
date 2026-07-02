import { prisma } from "@rdgw/database";
import { PLAYBOOK_DARES } from "@rdgw/playbook";
import Link from "next/link";

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
  const [userCount, playbookCount, communityCount, recentRuns] = await Promise.all([
    prisma.dgwUser.count(),
    prisma.playbookCompletion.count(),
    prisma.communityCompletion.count(),
    prisma.crawlRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
  ]);

  const pendingReview = await prisma.playbookCompletion.count({ where: { verified: null } });

  const typedRecentRuns = recentRuns as RecentCrawlRun[];

  const stats = [
    { label: "Total users", value: userCount },
    { label: "Playbook completions", value: playbookCount },
    { label: "Community completions", value: communityCount },
    { label: "Pending review", value: pendingReview, urgent: pendingReview > 0 },
    { label: "Total dares in playbook", value: PLAYBOOK_DARES.length },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`p-4 rounded-xl border ${s.urgent ? "border-yellow-700 bg-yellow-950/30" : "border-zinc-800 bg-zinc-900"}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent crawl runs</h2>
          <Link href="/crawler" className="text-sm text-zinc-400 hover:text-white">Run new crawl →</Link>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Target</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Posts</th>
                <th className="px-4 py-2">Completions</th>
                <th className="px-4 py-2">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {typedRecentRuns.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-400">{r.type}</td>
                  <td className="px-4 py-2">{r.target}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      r.status === "completed" ? "bg-green-950 text-green-400" :
                      r.status === "failed" ? "bg-red-950 text-red-400" :
                      "bg-yellow-950 text-yellow-400"
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">{r.postsFound}</td>
                  <td className="px-4 py-2">{r.completionsDetected}</td>
                  <td className="px-4 py-2 text-zinc-500 text-xs">{r.startedAt.toISOString().slice(0, 16)}</td>
                </tr>
              ))}
              {typedRecentRuns.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-zinc-600">No crawl runs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
