import { matchPlaybookDare } from "@rdgw/playbook";
import type { RedditPost } from "./reddit.js";
import type { prisma as prismaClient } from "@rdgw/database";

const DARED_BY_PATTERN = /dared\s*by/i;
const PLAYBOOK_PATTERN = /playbook/i;
const DARER_PATTERN = /\bu\/([A-Za-z0-9_-]{3,20})\b/gi;
const USERNAME_PATTERN = "[A-Za-z0-9_-]{3,20}";
const QUOTED_USERNAME_PATTERN = `["'“”‘’]?(${USERNAME_PATTERN})["'“”‘’]?`;
const DARER_CONTEXT_PATTERNS = [
  new RegExp(`\\bdared\\s+by\\s+(?:[ur]\\s*/\\s*)?${QUOTED_USERNAME_PATTERN}`, "gi"),
  new RegExp(
    `\\b(?:[ur]\\s*/\\s*)?${QUOTED_USERNAME_PATTERN}\\s+` +
      `(?:dared|ask(?:s|ed)?|requested)\\s+(?:me|us|for)\\b`,
    "gi"
  ),
  new RegExp(`\\b(?:by|for|from)\\s+(?:you\\s+)?${QUOTED_USERNAME_PATTERN}\\b`, "gi"),
];

const NON_USER_DARERS = new Set([
  "a",
  "all",
  "and",
  "community",
  "everyone",
  "he",
  "hubby",
  "me",
  "multiple",
  "requestor",
  "several",
  "she",
  "someone",
  "them",
  "the",
  "you",
]);

export interface DetectionResult {
  type: "playbook" | "community" | "none";
  dareSlug?: string;
  darerUsername?: string;
  confidence: number;
}

export function detectDareType(post: RedditPost): DetectionResult {
  const flair = post.link_flair_text ?? "";
  const isDaredBy = DARED_BY_PATTERN.test(flair);
  const isPlaybook = PLAYBOOK_PATTERN.test(flair);

  if (!isDaredBy && !isPlaybook) {
    return { type: "none", confidence: 0 };
  }

  const fullText = `${post.title} ${post.selftext}`;

  const matched = matchPlaybookDare(fullText);
  if (matched) {
    return {
      type: "playbook",
      dareSlug: matched.slug,
      confidence: matched.slug ? 0.8 : 0.5,
    };
  }

  if (isPlaybook) {
    return { type: "none", confidence: 0 };
  }

  const darers = extractDarerUsernames(fullText, post.author);

  if (darers.length > 0) {
    return {
      type: "community",
      darerUsername: darers[0],
      confidence: 0.9,
    };
  }

  return { type: "none", confidence: 0 };
}

function extractDarerUsernames(text: string, author: string) {
  const usernames = new Set<string>();

  for (const match of text.matchAll(DARER_PATTERN)) {
    addDarer(usernames, match[1], author);
  }

  for (const pattern of DARER_CONTEXT_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      addDarer(usernames, match[1], author);
    }
  }

  return [...usernames];
}

function addDarer(usernames: Set<string>, value: string | undefined, author: string) {
  const username = normaliseUsername(value);
  if (!username) return;

  const lower = username.toLowerCase();
  if (lower === author.toLowerCase()) return;
  if (NON_USER_DARERS.has(lower)) return;

  usernames.add(username);
}

function normaliseUsername(value: string | undefined) {
  const username = value?.replace(/^[ur]\s*\/\s*/i, "").replace(/[^\w-]+$/g, "") ?? "";
  return /^[A-Za-z0-9_-]{3,20}$/.test(username) ? username : null;
}

function isUsableAuthor(author: string) {
  return /^[A-Za-z0-9_-]{3,20}$/.test(author);
}

/**
 * Upsert a DgwPost and DgwUser, then create completion records if applicable.
 * Returns the number of new completions created.
 */
export async function processPost(
  post: RedditPost,
  prisma: typeof prismaClient,
  crawlRunId?: string
): Promise<number> {
  if (!isUsableAuthor(post.author)) return 0;

  const createdAtReddit = new Date(post.created_utc * 1000);

  const existingPost = await prisma.dgwPost.findUnique({
    where: { redditId: post.id },
    select: { id: true },
  });

  await prisma.dgwUser.upsert({
    where: { username: post.author },
    update: existingPost ? {} : { postCount: { increment: 1 } },
    create: { username: post.author, postCount: existingPost ? 0 : 1 },
  });

  const dgwPost = await prisma.dgwPost.upsert({
    where: { redditId: post.id },
    update: {
      subreddit: post.subreddit,
      score: post.score,
      upvoteCount: post.upvoteCount,
      upvoteRatio: post.upvote_ratio,
      commentCount: post.num_comments,
      shareCount: post.shareCount,
      crosspostCount: post.crosspostCount,
      mediaUrls: post.mediaUrls,
      imageUrls: post.imageUrls,
      outboundUrl: post.outboundUrl,
      thumbnailUrl: post.thumbnailUrl,
      flair: post.link_flair_text ?? null,
      title: post.title,
      selftext: post.selftext ?? "",
      permalink: post.permalink,
    },
    create: {
      subreddit: post.subreddit,
      redditId: post.id,
      authorUsername: post.author,
      title: post.title,
      selftext: post.selftext ?? "",
      flair: post.link_flair_text ?? null,
      score: post.score,
      upvoteCount: post.upvoteCount,
      upvoteRatio: post.upvote_ratio,
      commentCount: post.num_comments,
      shareCount: post.shareCount,
      crosspostCount: post.crosspostCount,
      mediaUrls: post.mediaUrls,
      imageUrls: post.imageUrls,
      outboundUrl: post.outboundUrl,
      thumbnailUrl: post.thumbnailUrl,
      permalink: post.permalink,
      createdAtReddit,
    },
  });

  const detection = detectDareType(post);
  if (detection.type === "none") return 0;

  let created = 0;

  if (detection.type === "playbook" && detection.dareSlug) {
    const completion = await prisma.playbookCompletion.upsert({
      where: {
        username_dareSlug: {
          username: post.author,
          dareSlug: detection.dareSlug,
        },
      },
      update: {},
      create: {
        username: post.author,
        dareSlug: detection.dareSlug,
        postId: dgwPost.id,
        confidence: detection.confidence,
        verified: null,
      },
    });

    if (completion.detectedAt.getTime() >= Date.now() - 1_000) {
      created++;
    }
  }

  if (detection.type === "community" && detection.darerUsername) {
    const completion = await prisma.communityCompletion.upsert({
      where: {
        username_postId: {
          username: post.author,
          postId: dgwPost.id,
        },
      },
      update: {},
      create: {
        username: post.author,
        darerUsername: detection.darerUsername,
        postId: dgwPost.id,
      },
    });

    if (completion.detectedAt.getTime() >= Date.now() - 1_000) {
      created++;
    }
  }

  if (crawlRunId && created > 0) {
    await prisma.crawlRun.update({
      where: { id: crawlRunId },
      data: { completionsDetected: { increment: created } },
    });
  }

  return created;
}
