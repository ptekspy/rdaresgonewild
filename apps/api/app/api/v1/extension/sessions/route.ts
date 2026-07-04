import { prisma } from "@rdgw/database";
import { jsonError, jsonResponse, optionsResponse } from "@/lib/http";
import { normaliseInstallId, normaliseUsername } from "@/lib/reddit";
import { createUploadToken, hashUploadToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExtensionCrawlMode = "page" | "profile" | "subreddit_cycle";

export function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Invalid JSON body");

  const crawlMode = parseCrawlMode(body.crawlMode);
  const redditUsername = normaliseUsername(body.redditUsername);
  if (crawlMode === "profile" && !redditUsername) return jsonError("redditUsername must be a valid Reddit username");

  const extensionInstallId = normaliseInstallId(body.extensionInstallId);
  if (!extensionInstallId) return jsonError("extensionInstallId is required");

  const clientVersion = typeof body.clientVersion === "string" ? body.clientVersion.slice(0, 64) : undefined;
  const sourceUrl = parseRedditSourceUrl(body.sourceUrl);
  const target = redditUsername ?? inferTargetFromSourceUrl(sourceUrl) ?? "pagecrawl";
  const uploadToken = createUploadToken();

  const session = await prisma.extensionIngestSession.create({
    data: {
      redditUsername: target,
      extensionInstallId,
      uploadTokenHash: hashUploadToken(uploadToken),
      clientVersion,
      crawlMode,
      sourceUrl,
    },
    select: {
      id: true,
      redditUsername: true,
      crawlMode: true,
      sourceUrl: true,
      status: true,
      startedAt: true,
    },
  });

  if (crawlMode === "profile" && redditUsername) {
    await prisma.dgwUser.upsert({
      where: { username: redditUsername },
      update: { syncStatus: "syncing" },
      create: { username: redditUsername, syncStatus: "syncing" },
    });
  }

  return jsonResponse({
    session,
    uploadToken,
    maxBatchSize: 100,
  });
}

function parseCrawlMode(value: unknown): ExtensionCrawlMode {
  if (value === "profile") return "profile";
  if (value === "subreddit_cycle") return "subreddit_cycle";
  return "page";
}

function parseRedditSourceUrl(value: unknown) {
  if (typeof value !== "string") return undefined;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!/(^|\.)reddit\.com$/.test(host)) return undefined;
    url.hash = "";
    return url.toString().slice(0, 2048);
  } catch {
    return undefined;
  }
}

function inferTargetFromSourceUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const user = url.pathname.match(/\/user\/([^/?#]+)/i)?.[1];
    const subreddit = url.pathname.match(/\/r\/([^/?#]+)/i)?.[1];

    if (user) return normaliseUsername(user) ?? sanitiseTarget(`u_${user}`);
    if (subreddit) return sanitiseTarget(`r_${subreddit}`);
    if (url.pathname.match(/^\/new\/?$/i)) return "reddit_new";

    return "reddit_home";
  } catch {
    return null;
  }
}

function sanitiseTarget(value: string) {
  const target = value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
  return target || null;
}
