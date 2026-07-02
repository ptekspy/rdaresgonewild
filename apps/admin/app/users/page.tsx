import { prisma } from "@rdgw/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

const PAGE_SIZE = 100;

type UserRow = {
  id: string;
  username: string;
  syncStatus: string;
  lastSyncedAt: Date | null;
  _count: {
    playbookCompletions: number;
    communityCompletions: number;
  };
};

export default async function UsersPage({ searchParams }: PageProps) {
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));

  const [users, total] = await Promise.all([
    prisma.dgwUser.findMany({
      orderBy: { lastSyncedAt: { sort: "desc", nulls: "last" } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: {
          select: { playbookCompletions: true, communityCompletions: true },
        },
      },
    }),
    prisma.dgwUser.count(),
  ]);

  const typedUsers = users as UserRow[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Users ({total})</h1>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-left">
              <th className="px-4 py-2">Username</th>
              <th className="px-4 py-2">Sync status</th>
              <th className="px-4 py-2">Last synced</th>
              <th className="px-4 py-2">Playbook</th>
              <th className="px-4 py-2">Community</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {typedUsers.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">u/{u.username}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    u.syncStatus === "fresh" ? "bg-green-950 text-green-400" :
                    u.syncStatus === "syncing" ? "bg-yellow-950 text-yellow-400" :
                    u.syncStatus === "stale" ? "bg-orange-950 text-orange-400" :
                    "bg-zinc-800 text-zinc-500"
                  }`}>
                    {u.syncStatus}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-500 text-xs">
                  {u.lastSyncedAt ? u.lastSyncedAt.toISOString().slice(0, 16) : "never"}
                </td>
                <td className="px-4 py-2">{u._count.playbookCompletions}</td>
                <td className="px-4 py-2">{u._count.communityCompletions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
