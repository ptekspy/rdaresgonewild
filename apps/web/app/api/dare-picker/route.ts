import { NextRequest, NextResponse } from "next/server";
import {
  DARE_REQUIREMENTS_BY_SLUG,
  isDareRequirementId,
  PLAYBOOK_DARES,
} from "@rdgw/playbook";
import type { DareRequirementId } from "@rdgw/playbook";
import { getDb } from "@/lib/db";
import { isValidUsername, normaliseUsername } from "@/lib/username";

const NOT_REJECTED = { OR: [{ verified: true }, { verified: null }] };
const MIN_LEVEL = 1;
const MAX_LEVEL = 13;

function numberInRange(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, value));
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? normaliseUsername(body.username) : "";
  const minLevel = numberInRange(body.minLevel, MIN_LEVEL);
  const maxLevel = numberInRange(body.maxLevel, MAX_LEVEL);
  const selectedRequirements: DareRequirementId[] = Array.isArray(body.requirements)
    ? body.requirements.filter((value: unknown) => typeof value === "string" && isDareRequirementId(value))
    : [];

  if (!isValidUsername(username)) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  const lowerLevel = Math.min(minLevel, maxLevel);
  const upperLevel = Math.max(minLevel, maxLevel);

  // Only use existing completion data. If there are no rows for this username,
  // treat the user as having completed nothing.
  const completions = await db.playbookCompletion.findMany({
    where: { username, ...NOT_REJECTED },
    select: { dareSlug: true },
  });
  const completedSlugs = new Set(completions.map((completion: { dareSlug: string }) => completion.dareSlug));

  const eligible = PLAYBOOK_DARES.filter((dare) => {
    if (completedSlugs.has(dare.slug)) return false;
    if (dare.levelOrder < lowerLevel || dare.levelOrder > upperLevel) return false;

    const dareRequirements = DARE_REQUIREMENTS_BY_SLUG[dare.slug] ?? [];
    return dareRequirements.some((requirement) => selectedRequirements.includes(requirement));
  });

  if (eligible.length === 0) {
    return NextResponse.json({
      status: "no_dares_left",
      completedCount: completedSlugs.size,
      totalDares: PLAYBOOK_DARES.length,
      eligibleCount: 0,
    });
  }

  const pick = eligible[Math.floor(Math.random() * eligible.length)];

  return NextResponse.json({
    status: "done",
    dare: pick,
    completedCount: completedSlugs.size,
    totalDares: PLAYBOOK_DARES.length,
    eligibleCount: eligible.length,
  });
}
