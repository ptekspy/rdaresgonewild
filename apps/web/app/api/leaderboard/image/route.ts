import { getDb } from "@/lib/db";

export const revalidate = 3600;

const IMAGE_SIZE = 500;
const ROW_LIMIT = 10;
const CACHE_SECONDS = 60 * 60;
const ROW_TOP = 132;
const ROW_HEIGHT = 27;
const ROW_GAP = 5;

type LeaderboardTab = "overall" | "playbook" | "community";

interface LeaderboardRow {
  username: string;
  count: number;
}

function getTab(value: string | null): LeaderboardTab {
  if (value === "playbook" || value === "community" || value === "overall") {
    return value;
  }

  return "overall";
}

function getTitle(tab: LeaderboardTab) {
  if (tab === "playbook") return "Playbook Top 10";
  if (tab === "community") return "Community Top 10";
  return "Leaderboard Top 10";
}

function getMetricLabel(tab: LeaderboardTab) {
  if (tab === "playbook") return "playbook dares";
  if (tab === "community") return "community dares";
  return "total dares";
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncateUsername(username: string) {
  return username.length > 36 ? `${username.slice(0, 35)}...` : username;
}

async function getLeaderboardRows(tab: LeaderboardTab): Promise<LeaderboardRow[]> {
  const db = getDb();

  if (tab === "playbook") {
    const rows = await db.playbookCompletion.groupBy({
      by: ["username"],
      where: { OR: [{ verified: true }, { verified: null }] },
      _count: { dareSlug: true },
      orderBy: [{ _count: { dareSlug: "desc" } }, { username: "asc" }],
      take: ROW_LIMIT,
    });

    return rows.map((row) => ({
      username: row.username,
      count: row._count.dareSlug,
    }));
  }

  if (tab === "community") {
    const rows = await db.communityCompletion.groupBy({
      by: ["username"],
      where: { OR: [{ verified: true }, { verified: null }] },
      _count: { id: true },
      orderBy: [{ _count: { id: "desc" } }, { username: "asc" }],
      take: ROW_LIMIT,
    });

    return rows.map((row) => ({
      username: row.username,
      count: row._count.id,
    }));
  }

  const rows: Array<{ username: string; total: bigint }> = await db.$queryRaw`
    SELECT username, COUNT(*) AS total FROM (
      SELECT username FROM "PlaybookCompletion" WHERE verified IS NOT FALSE
      UNION ALL
      SELECT username FROM "CommunityCompletion" WHERE verified IS NOT FALSE
    ) combined
    GROUP BY username
    ORDER BY total DESC, username ASC
    LIMIT ${ROW_LIMIT}
  `;

  return rows.map((row) => ({
    username: row.username,
    count: Number(row.total),
  }));
}

function renderRows(rows: LeaderboardRow[], tab: LeaderboardTab) {
  if (rows.length === 0) {
    return `
      <text x="250" y="275" text-anchor="middle" fill="#a1a1aa" font-size="18" font-weight="700">No leaderboard data yet</text>
      <text x="250" y="303" text-anchor="middle" fill="#71717a" font-size="13">Check back after the next crawl</text>
    `;
  }

  return rows
    .map((row, index) => {
      const rank = index + 1;
      const rowTop = ROW_TOP + index * (ROW_HEIGHT + ROW_GAP);
      const centerY = rowTop + ROW_HEIGHT / 2;
      const textY = centerY + 5;
      const isPodium = rank <= 3;
      const rankFill = isPodium ? "#ef4444" : "#27272a";
      const username = escapeXml(truncateUsername(row.username));
      const count = escapeXml(String(row.count));

      return `
        <g>
          <rect x="28" y="${rowTop}" width="444" height="${ROW_HEIGHT}" rx="8" fill="${index % 2 === 0 ? "#151518" : "#101012"}" stroke="#27272a" stroke-width="1" />
          <circle cx="49" cy="${centerY}" r="11" fill="${rankFill}" />
          <text x="49" y="${textY - 1}" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="800">${rank}</text>
          <text x="72" y="${textY}" fill="#fafafa" font-size="15" font-weight="${isPodium ? "800" : "700"}">u/${username}</text>
          <text x="453" y="${textY}" text-anchor="end" fill="#ffffff" font-size="15" font-weight="800">${count}</text>
        </g>
      `;
    })
    .join("") + `
      <text x="453" y="461" text-anchor="end" fill="#71717a" font-size="12">${escapeXml(getMetricLabel(tab))}</text>
    `;
}

function renderSvg(rows: LeaderboardRow[], tab: LeaderboardTab) {
  const title = escapeXml(getTitle(tab));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}" role="img" aria-label="${title}">
  <rect width="500" height="500" fill="#09090b"/>
  <rect x="0" y="0" width="500" height="500" fill="url(#bg)"/>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#18181b"/>
      <stop offset="54%" stop-color="#09090b"/>
      <stop offset="100%" stop-color="#1f1215"/>
    </linearGradient>
  </defs>
  <rect x="18" y="18" width="464" height="464" rx="22" fill="#0f0f12" stroke="#3f3f46" stroke-width="1"/>
  <rect x="18" y="18" width="464" height="70" rx="22" fill="#18181b"/>
  <rect x="18" y="66" width="464" height="22" fill="#18181b"/>
  <rect x="34" y="78" width="108" height="3" rx="2" fill="#ef4444"/>
  <text x="34" y="55" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900">${title}</text>
  <text x="35" y="106" fill="#a1a1aa" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700">r/daresgonewild</text>
  <text x="465" y="106" text-anchor="end" fill="#71717a" font-family="Arial, Helvetica, sans-serif" font-size="12">cached for 1 hour</text>
  <g font-family="Arial, Helvetica, sans-serif">
    ${renderRows(rows, tab)}
  </g>
</svg>`;
}

export async function GET(request: Request) {
  const tab = getTab(new URL(request.url).searchParams.get("tab"));
  const rows = await getLeaderboardRows(tab);
  const svg = renderSvg(rows, tab);

  return new Response(svg, {
    headers: {
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
