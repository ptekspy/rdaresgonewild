import { NextRequest, NextResponse } from "next/server";
import { PLAYBOOK_DARES } from "@rdgw/playbook";
import { getDb } from "@/lib/db";
import { isValidUsername, normaliseUsername } from "@/lib/username";

const FRESH_MS = 60 * 60 * 1000; // 1 hour
const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const NOT_REJECTED = { OR: [{ verified: true }, { verified: null }] };

function getUserSyncStatus(user: { syncStatus: string; lastSyncedAt: Date | null }) {
  if (user.syncStatus === "never" || !user.lastSyncedAt) return "never";
  const age = Date.now() - user.lastSyncedAt.getTime();
  if (age > STALE_MS) return "never";
  if (age > FRESH_MS) return "stale";
  return "fresh";
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? normaliseUsername(body.username) : "";

  if (!isValidUsername(username)) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  // Get or create user
  let user = await db.dgwUser.findUnique({ where: { username } });
  if (!user) {
    user = await db.dgwUser.create({ data: { username } });
  }

  const status = getUserSyncStatus(user);

  // Cloudflare web stays request-only; the separate crawler/worker fills Neon.
  if (status === "never") {
    return NextResponse.json({
      status: "syncing",
      completedCount: 0,
      totalDares: PLAYBOOK_DARES.length,
      message: "This creator has not been picked up by the crawler yet. Try again after the next crawl.",
    });
  }

  // Get completed dare slugs
  const completions = await db.playbookCompletion.findMany({
    where: { username, ...NOT_REJECTED },
    select: { dareSlug: true },
  });
  const completedSlugs = new Set(completions.map((c: { dareSlug: any; }) => c.dareSlug));

  // Filter eligible dares
  const eligible = PLAYBOOK_DARES.filter((d: { slug: unknown; }) => !completedSlugs.has(d.slug));

  if (eligible.length === 0) {
    return NextResponse.json({
      status: "no_dares_left",
      completedCount: completedSlugs.size,
      totalDares: PLAYBOOK_DARES.length,
    });
  }

  // Pick the lowest-level uncompleted dare (random within same level)
  const minLevel = eligible.reduce((min: number, d: { levelOrder: number; }) => Math.min(min, d.levelOrder), Infinity);
  const sameLevel = eligible.filter((d: { levelOrder: any; }) => d.levelOrder === minLevel);
  const pick = sameLevel[Math.floor(Math.random() * sameLevel.length)];

  return NextResponse.json({
    status: "done",
    dare: pick,
    completedCount: completedSlugs.size,
    totalDares: PLAYBOOK_DARES.length,
  });
}
