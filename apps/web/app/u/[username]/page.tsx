import { getDb } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PLAYBOOK_BY_SLUG, PLAYBOOK_DARES, LEVEL_LABELS } from "@rdgw/playbook";
import { AdSlot } from "@/components/AdSlot";
import { ProfilePersonalization } from "@/components/ProfilePersonalization";

export const dynamic = "force-dynamic";
const NOT_REJECTED = { OR: [{ verified: true }, { verified: null }] };

type PlaybookCompletionSummary = {
  dareSlug: string;
  detectedAt: Date;
  post: {
    permalink: string;
  };
};

type CommunityCompletionSummary = {
  id: string;
  darerUsername: string;
  detectedAt: Date;
  post: {
    permalink: string;
  };
};

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

  const [playbookCompletions, communityCompletions]: [
    PlaybookCompletionSummary[],
    CommunityCompletionSummary[],
  ] = await Promise.all([
    db.playbookCompletion.findMany({
      where: { username, ...NOT_REJECTED },
      orderBy: { detectedAt: "desc" },
      select: { dareSlug: true, detectedAt: true, post: { select: { permalink: true } } },
    }),
    db.communityCompletion.findMany({
      where: { username, ...NOT_REJECTED },
      orderBy: { detectedAt: "desc" },
      select: { id: true, darerUsername: true, detectedAt: true, post: { select: { permalink: true } } },
    }),
  ]);

  const completedSlugs = new Set(playbookCompletions.map((completion) => completion.dareSlug));
  const playbookCompletionBySlug = new Map(
    playbookCompletions.map((completion) => [completion.dareSlug, completion])
  );
  const totalDares = PLAYBOOK_DARES.length;
  const completedCount = completedSlugs.size;
  const pct = Math.round((completedCount / totalDares) * 100);

  const completedDares = [...completedSlugs]
    .map((slug) => PLAYBOOK_BY_SLUG.get(slug))
    .filter(Boolean);
  const maxLevel = completedDares.reduce((max, dare) => Math.max(max, dare!.levelOrder), 0);
  const highestLevel = maxLevel > 0 ? Object.values(LEVEL_LABELS)[maxLevel - 1] : null;

  return (
    <div className="rdgw-page-shell max-w-5xl py-10 space-y-8">
      <section className="rdgw-card-strong rdgw-glow-border overflow-hidden p-6 sm:p-8">
        <Link href="/leaderboard" className="rdgw-link text-sm font-bold">
          ← Leaderboard
        </Link>
        <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="rdgw-kicker">Creator profile</span>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">u/{username}</h1>
            {highestLevel && (
              <p className="mt-3 text-sm text-zinc-300">
                Highest level: <span className="font-bold text-pink-100">{highestLevel}</span>
              </p>
            )}
          </div>
          <div className="text-left md:text-right">
            <ProfilePersonalization username={username} />
            <p className="mt-3 text-4xl font-black text-white">
              {completedCount}<span className="text-zinc-600">/{totalDares}</span>
            </p>
            <p className="text-xs uppercase tracking-wider text-zinc-500">dares completed</p>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <div className="rdgw-progress">
            <div className="rdgw-progress-fill transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-right text-xs text-zinc-500">{pct}% of playbook complete</p>
        </div>
      </section>

      {!user && (
        <div className="rdgw-card px-4 py-8 text-center text-sm text-zinc-500">
          This user hasn't been synced yet. Visit{" "}
          <Link href="/dare-picker" className="rdgw-link font-bold">Dare Picker</Link>{" "}
          and enter their username to sync their history.
        </div>
      )}

      {completedCount === 0 && user && (
        <div className="rdgw-card px-4 py-8 text-center text-sm text-zinc-500">
          No playbook completions detected yet. Posts must have "Dared by" flair on r/daresgonewild.
        </div>
      )}

      <AdSlot slotKey="profile_sidebar" />

      {completedCount > 0 && (
        <section className="space-y-6">
          <h2 className="text-2xl font-black text-white">Playbook dares</h2>
          {Object.entries(LEVEL_LABELS).map(([levelKey, levelLabel]) => {
            const levelDares = PLAYBOOK_DARES.filter((dare) => dare.level === levelKey);
            const doneInLevel = levelDares.filter((dare) => completedSlugs.has(dare.slug));
            if (doneInLevel.length === 0) return null;
            return (
              <div key={levelKey} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-400">
                    {levelLabel}
                  </h3>
                  <span className="rounded-full bg-white/[0.07] px-3 py-1 text-xs font-bold text-zinc-400">
                    {doneInLevel.length}/{levelDares.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {doneInLevel.map((dare) => {
                    const completion = playbookCompletionBySlug.get(dare.slug);
                    return (
                      <div key={dare.slug} className="rdgw-card flex items-center gap-3 rounded-2xl p-3 text-sm">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-xl">{dare.emoji}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">{dare.name}</span>
                        {completion?.post.permalink ? (
                          <a
                            href={completion.post.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rdgw-link shrink-0 text-xs font-bold"
                          >
                            view →
                          </a>
                        ) : (
                          <span className="shrink-0 text-xs font-bold text-pink-200">✓</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {communityCompletions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-2xl font-black text-white">Community dares ({communityCompletions.length})</h2>
          <div className="rdgw-card divide-y divide-white/[0.08] overflow-hidden">
            {communityCompletions.map((completion) => (
              <div key={completion.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="text-zinc-400">Dared by</span>
                <span className="font-bold text-white">u/{completion.darerUsername}</span>
                <a
                  href={completion.post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rdgw-link ml-auto text-xs font-bold"
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
