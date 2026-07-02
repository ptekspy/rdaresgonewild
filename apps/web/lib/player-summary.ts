export type AchievementId =
  | "first-dare"
  | "level-cleared"
  | "halfway-there"
  | "playbook-complete"
  | "community-challenger"
  | "top-10";

export interface PlayerAchievement {
  id: AchievementId;
  label: string;
  description: string;
  unlocked: boolean;
}

export interface PlayerGoal {
  id: string;
  label: string;
  description: string;
  href: string;
}

export interface RecentCompletion {
  type: "playbook" | "community";
  label: string;
  detail: string;
  detectedAt: string;
}

export interface PlayerSummary {
  username: string;
  exists: boolean;
  syncStatus: string | null;
  syncMessage: string | null;
  playbookCompletedCount: number;
  totalDares: number;
  percentComplete: number;
  highestLevel: {
    order: number;
    label: string;
  } | null;
  leaderboardRank: number | null;
  communityCompletedCount: number;
  recentCompletions: RecentCompletion[];
  achievements: PlayerAchievement[];
  suggestedGoals: PlayerGoal[];
}
