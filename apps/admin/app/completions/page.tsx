import { prisma } from "@rdgw/database";
import { PLAYBOOK_BY_SLUG } from "@rdgw/playbook";
import { verifyCompletion } from "../crawler/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Completions" };

type PendingPlaybookCompletion = {
  id: string;
  username: string;
  dareSlug: string;
  confidence: number;
  detectedAt: Date;
};

type PendingCommunityCompletion = {
  id: string;
  username: string;
  darerUsername: string;
  detectedAt: Date;
};

export default async function CompletionsPage() {
  const [pending, recentVerified] = await Promise.all([
    prisma.playbookCompletion.findMany({
      where: { verified: null },
      orderBy: { detectedAt: "desc" },
      take: 50,
    }),
    prisma.communityCompletion.findMany({
      where: { verified: null },
      orderBy: { detectedAt: "desc" },
      take: 50,
    }),
  ]);

  const pendingPlaybook = pending as PendingPlaybookCompletion[];
  const pendingCommunity = recentVerified as PendingCommunityCompletion[];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Completions Review</h1>

      {/* Pending playbook */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending Playbook ({pendingPlaybook.length})</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Dare</th>
                <th className="px-4 py-2">Confidence</th>
                <th className="px-4 py-2">Detected</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {pendingPlaybook.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-zinc-600">No pending reviews.</td></tr>
              )}
              {pendingPlaybook.map((c) => {
                const dare = PLAYBOOK_BY_SLUG.get(c.dareSlug);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2">u/{c.username}</td>
                    <td className="px-4 py-2">{dare ? `${dare.emoji} ${dare.name}` : c.dareSlug}</td>
                    <td className="px-4 py-2 text-zinc-400">{Math.round(c.confidence * 100)}%</td>
                    <td className="px-4 py-2 text-zinc-500 text-xs">{c.detectedAt.toISOString().slice(0, 16)}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <form action={verifyCompletion.bind(null, c.id, "playbook", true)}>
                          <button className="px-2 py-1 bg-green-900 hover:bg-green-800 text-green-300 text-xs rounded transition-colors">✓ Verify</button>
                        </form>
                        <form action={verifyCompletion.bind(null, c.id, "playbook", false)}>
                          <button className="px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 text-xs rounded transition-colors">✗ Reject</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pending community */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending Community ({pendingCommunity.length})</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="px-4 py-2">Creator</th>
                <th className="px-4 py-2">Dared by</th>
                <th className="px-4 py-2">Detected</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {pendingCommunity.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-zinc-600">No pending reviews.</td></tr>
              )}
              {pendingCommunity.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2">u/{c.username}</td>
                  <td className="px-4 py-2">u/{c.darerUsername}</td>
                  <td className="px-4 py-2 text-zinc-500 text-xs">{c.detectedAt.toISOString().slice(0, 16)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <form action={verifyCompletion.bind(null, c.id, "community", true)}>
                        <button className="px-2 py-1 bg-green-900 hover:bg-green-800 text-green-300 text-xs rounded transition-colors">✓ Verify</button>
                      </form>
                      <form action={verifyCompletion.bind(null, c.id, "community", false)}>
                        <button className="px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 text-xs rounded transition-colors">✗ Reject</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
