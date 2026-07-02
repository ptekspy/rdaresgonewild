import { getDb } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PLAYBOOK_BY_SLUG, PLAYBOOK_DARES, LEVEL_LABELS } from "@rdgw/playbook";
import { AdSlot } from "@/components/AdSlot";

export const dynamic = "force-dynamic";
const NOT_REJECTED = { OR: [{ verified: true }, { verified: null }] };

interface PageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  return { title: `u/${username}` };
}

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = await params;
  const db = getDb();

  const user = await db.dgwUser.findUnique({ where: { username } });

  const [playbookCompletions, communityCompletions] = await Promise.all([
    db.playbookCompletion.findMany({
      where: { username, ...NOT_REJECTED },
      orderBy: { detectedAt: "desc" },
    }),
    db.communityCompletion.findMany({
      where: { username, ...NOT_REJECTED },
      orderBy: { detectedAt: "desc" },
    }),
  ]);

  const completedSlugs = new Set(playbookCompletions.map((c) => c.dareSlug));
  const totalDares = PLAYBOOK_DARES.length;
  const completedCount = completedSlugs.size;
  const pct = Math.round((completedCount / totalDares) * 100);

  // Find highest level reached
  const completedDares = [...completedSlugs]
    .map((slug) => PLAYBOOK_BY_SLUG.get(slug))
    .filter(Boolean);
  const maxLevel = completedDares.reduce((max, d) => Math.max(max, d!.levelOrder), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <Link href="/leaderboard" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Leaderboard
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">u/{username}</h1>
            {maxLevel > 0 && (
              <p className="text-zinc-400 text-sm mt-1">
                Highest level: <span className="text-red-400">{Object.values(LEVEL_LABELS)[maxLevel - 1]}</span>
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{completedCount}<span className="text-zinc-600">/{totalDares}</span></p>
            <p className="text-xs text-zinc-500">dares completed</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500 text-right">{pct}% of playbook complete</p>
        </div>
      </div>

      {!user && (
        <div className="px-4 py-8 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-zinc-500 text-sm">
          This user hasn't been synced yet. Visit{" "}
          <Link href="/dare-picker" className="text-red-500 hover:text-red-400">Dare Picker</Link>{" "}
          and enter their username to sync their history.
        </div>
      )}

      {completedCount === 0 && user && (
        <div className="px-4 py-8 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-zinc-500 text-sm">
          No playbook completions detected yet. Posts must have "Dared by" flair on r/daresgonewild.
        </div>
      )}

      <AdSlot slotKey="profile_sidebar" />

      {/* Playbook completions by level */}
      {completedCount > 0 && (
        <section className="space-y-6">
          <h2 className="text-xl font-bold">🎯 Playbook Dares</h2>
          {Object.entries(LEVEL_LABELS).map(([levelKey, levelLabel]) => {
            const levelDares = PLAYBOOK_DARES.filter((d) => d.level === levelKey);
            const doneInLevel = levelDares.filter((d) => completedSlugs.has(d.slug));
            if (doneInLevel.length === 0) return null;
            return (
              <div key={levelKey} className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                  {levelLabel} ({doneInLevel.length}/{levelDares.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {doneInLevel.map((dare) => (
                    <div key={dare.slug} className="flex items-center gap-3 px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm">
                      <span className="text-xl">{dare.emoji}</span>
                      <span className="text-zinc-200">{dare.name}</span>
                      <span className="ml-auto text-green-500 text-xs">✓</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Community dares */}
      {communityCompletions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">🤝 Community Dares ({communityCompletions.length})</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {communityCompletions.map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                <span className="text-zinc-400">Dared by</span>
                <span className="font-medium text-white">u/{c.darerUsername}</span>
                <a
                  href={`https://reddit.com/r/daresgonewild`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-xs text-zinc-600 hover:text-zinc-400"
                >
                  view →
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
