import { NextRequest, NextResponse } from "next/server";
import { LEVEL_LABELS, PLAYBOOK_BY_SLUG, PLAYBOOK_DARES } from "@rdgw/playbook";
import { getDb } from "@/lib/db";
import type { PlayerAchievement, PlayerGoal, PlayerSummary, RecentCompletion } from "@/lib/player-summary";
import { isValidUsername, normaliseUsername } from "@/lib/username";

export const dynamic = "force-dynamic";

const NOT_REJECTED = { OR: [{ verified: true }, { verified: null }] };

function getEmptySummary(username: string): PlayerSummary {
  return {
    username,
    exists: false,
    syncStatus: null,
    syncMessage: "This user has not been synced yet. Pick a dare or check back after the crawler sees them.",
    playbookCompletedCount: 0,
    totalDares: PLAYBOOK_DARES.length,
    percentComplete: 0,
    highestLevel: null,
    leaderboardRank: null,
    communityCompletedCount: 0,
    recentCompletions: [],
    achievements: buildAchievements({
      playbookCompletedCount: 0,
      percentComplete: 0,
      levelCleared: false,
      communityCompletedCount: 0,
      leaderboardRank: null,
    }),
    suggestedGoals: buildGoals({
      username,
      completedSlugs: new Set(),
      communityCompletedCount: 0,
      leaderboardRank: null,
    }),
  };
}

function buildAchievements(input: {
  playbookCompletedCount: number;
  percentComplete: number;
  levelCleared: boolean;
  communityCompletedCount: number;
  leaderboardRank: number | null;
}): PlayerAchievement[] {
  return [
    {
      id: "first-dare",
      label: "First Dare",
      description: "Complete one playbook dare.",
      unlocked: input.playbookCompletedCount >= 1,
    },
    {
      id: "level-cleared",
      label: "Level Cleared",
      description: "Complete every dare in any level.",
      unlocked: input.levelCleared,
    },
    {
      id: "halfway-there",
      label: "Halfway There",
      description: "Reach 50% playbook completion.",
      unlocked: input.percentComplete >= 50,
    },
    {
      id: "playbook-complete",
      label: "Playbook Complete",
      description: "Complete every playbook dare.",
      unlocked: input.playbookCompletedCount >= PLAYBOOK_DARES.length,
    },
    {
      id: "community-challenger",
      label: "Community Challenger",
      description: "Complete one community dare.",
      unlocked: input.communityCompletedCount >= 1,
    },
    {
      id: "top-10",
      label: "Top 10",
      description: "Reach the overall leaderboard top 10.",
      unlocked: input.leaderboardRank !== null && input.leaderboardRank <= 10,
    },
  ];
}

function buildGoals(input: {
  username: string;
  completedSlugs: Set<string>;
  communityCompletedCount: number;
  leaderboardRank: number | null;
}): PlayerGoal[] {
  const goals: PlayerGoal[] = [];
  const nextDare = PLAYBOOK_DARES.find((dare) => !input.completedSlugs.has(dare.slug));

  if (nextDare) {
    goals.push({
      id: "next-dare",
      label: `Next up: ${nextDare.name}`,
      description: `Complete a ${LEVEL_LABELS[nextDare.level]} dare and post it for the crawler to verify.`,
      href: "/dare-picker",
    });
  }

  const partialLevels = Object.entries(LEVEL_LABELS)
    .map(([level, label]) => {
      const levelDares = PLAYBOOK_DARES.filter((dare) => dare.level === level);
      const completed = levelDares.filter((dare) => input.completedSlugs.has(dare.slug)).length;
      return {
        label,
        completed,
        total: levelDares.length,
        remaining: levelDares.length - completed,
        order: levelDares[0]?.levelOrder ?? 99,
      };
    })
    .filter((level) => level.completed > 0 && level.remaining > 0)
    .sort((a, b) => a.remaining - b.remaining || a.order - b.order);

  const nearestLevel = partialLevels[0];
  if (nearestLevel) {
    goals.push({
      id: "finish-level",
      label: `Finish ${nearestLevel.label}`,
      description: `${nearestLevel.completed}/${nearestLevel.total} complete. ${nearestLevel.remaining} more verified dares clears it.`,
      href: `/u/${input.username}`,
    });
  }

  if (input.communityCompletedCount === 0) {
    goals.push({
      id: "community-dare",
      label: "Try a community dare",
      description: "Complete a dare from another creator to unlock Community Challenger.",
      href: "/dare-picker",
    });
  }

  if (input.leaderboardRank === null || input.leaderboardRank > 10) {
    goals.push({
      id: "climb-leaderboard",
      label: "Climb toward Top 10",
      description: input.leaderboardRank
        ? `You are currently #${input.leaderboardRank} overall. Keep completing verified dares.`
        : "Get your first verified completion to enter the overall leaderboard.",
      href: "/leaderboard?tab=overall",
    });
  }

  return goals.slice(0, 4);
}

function getHighestLevel(completedSlugs: Set<string>) {
  const completedDares = [...completedSlugs]
    .map((slug) => PLAYBOOK_BY_SLUG.get(slug))
    .filter(Boolean);
  const order = completedDares.reduce((max, dare) => Math.max(max, dare!.levelOrder), 0);

  if (order === 0) return null;

  return {
    order,
    label: Object.values(LEVEL_LABELS)[order - 1] ?? `Level ${order}`,
  };
}

function hasClearedLevel(completedSlugs: Set<string>) {
  return Object.keys(LEVEL_LABELS).some((level) => {
    const levelDares = PLAYBOOK_DARES.filter((dare) => dare.level === level);
    return levelDares.length > 0 && levelDares.every((dare) => completedSlugs.has(dare.slug));
  });
}

export async function GET(request: NextRequest) {
  const username = normaliseUsername(request.nextUrl.searchParams.get("username") ?? "");

  if (!isValidUsername(username)) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  const db = getDb();
  const [user, playbookCompletions, communityCompletedCount, communityRecent, rankRows] = await Promise.all([
    db.dgwUser.findUnique({ where: { username } }),
    db.playbookCompletion.findMany({
      where: { username, ...NOT_REJECTED },
      orderBy: { detectedAt: "desc" },
      select: { dareSlug: true, detectedAt: true },
    }),
    db.communityCompletion.count({ where: { username, ...NOT_REJECTED } }),
    db.communityCompletion.findMany({
      where: { username, ...NOT_REJECTED },
      orderBy: { detectedAt: "desc" },
      take: 5,
      select: { darerUsername: true, detectedAt: true },
    }),
    db.$queryRaw<Array<{ rank_position: bigint }>>`
      WITH combined AS (
        SELECT username FROM "PlaybookCompletion" WHERE verified IS NOT FALSE
        UNION ALL
        SELECT username FROM "CommunityCompletion" WHERE verified IS NOT FALSE
      ),
      totals AS (
        SELECT username, COUNT(*) AS total
        FROM combined
        GROUP BY username
      ),
      ranked AS (
        SELECT username, RANK() OVER (ORDER BY total DESC, username ASC) AS rank_position
        FROM totals
      )
      SELECT rank_position FROM ranked WHERE username = ${username} LIMIT 1
    `,
  ]);

  if (!user && playbookCompletions.length === 0 && communityCompletedCount === 0) {
    return NextResponse.json(getEmptySummary(username));
  }

  const completedSlugs = new Set(playbookCompletions.map((completion) => completion.dareSlug));
  const playbookCompletedCount = completedSlugs.size;
  const percentComplete = Math.round((playbookCompletedCount / PLAYBOOK_DARES.length) * 100);
  const leaderboardRank = rankRows[0]?.rank_position ? Number(rankRows[0].rank_position) : null;
  const levelCleared = hasClearedLevel(completedSlugs);
  const recentCompletions: RecentCompletion[] = [
    ...playbookCompletions.slice(0, 5).map((completion) => {
      const dare = PLAYBOOK_BY_SLUG.get(completion.dareSlug);
      return {
        type: "playbook" as const,
        label: dare?.name ?? completion.dareSlug,
        detail: dare ? LEVEL_LABELS[dare.level] : "Playbook",
        detectedAt: completion.detectedAt.toISOString(),
      };
    }),
    ...communityRecent.map((completion) => ({
      type: "community" as const,
      label: "Community dare",
      detail: `Dared by u/${completion.darerUsername}`,
      detectedAt: completion.detectedAt.toISOString(),
    })),
  ]
    .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
    .slice(0, 5);

  const achievements = buildAchievements({
    playbookCompletedCount,
    percentComplete,
    levelCleared,
    communityCompletedCount,
    leaderboardRank,
  });

  const summary: PlayerSummary = {
    username,
    exists: Boolean(user),
    syncStatus: user?.syncStatus ?? null,
    syncMessage: user
      ? null
      : "This user has completions, but no synced user record was found yet.",
    playbookCompletedCount,
    totalDares: PLAYBOOK_DARES.length,
    percentComplete,
    highestLevel: getHighestLevel(completedSlugs),
    leaderboardRank,
    communityCompletedCount,
    recentCompletions,
    achievements,
    suggestedGoals: buildGoals({
      username,
      completedSlugs,
      communityCompletedCount,
      leaderboardRank,
    }),
  };

  return NextResponse.json(summary);
}
