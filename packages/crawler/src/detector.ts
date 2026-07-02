import { matchPlaybookDare } from "@rdgw/playbook";
import type { RedditPost } from "./reddit.js";
import type { prisma as prismaClient } from "@rdgw/database";

const DARED_BY_PATTERN = /dared\s*by/i;
const PLAYBOOK_PATTERN = /playbook/i;
const DARER_PATTERN = /\bu\/([A-Za-z0-9_-]{3,20})\b/g;

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

  // Try playbook match first
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

  // Try community dare: look for u/username in title or selftext
  const darers = [...fullText.matchAll(DARER_PATTERN)]
    .map((m) => m[1])
    .filter((u) => u.toLowerCase() !== post.author.toLowerCase()); // exclude self-reference

  if (darers.length > 0) {
    return {
      type: "community",
      darerUsername: darers[0], // first mention
      confidence: 0.9,
    };
  }

  // Has "Dared by" flair but couldn't identify specifics
  return { type: "none", confidence: 0 };
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
  const createdAtReddit = new Date(post.created_utc * 1000);

  // Upsert user
  await prisma.dgwUser.upsert({
    where: { username: post.author },
    update: { postCount: { increment: 1 } },
    create: { username: post.author },
  });

  // Upsert post
  await prisma.dgwPost.upsert({
    where: { redditId: post.id },
    update: {
      score: post.score,
      upvoteRatio: post.upvote_ratio,
      commentCount: post.num_comments,
      flair: post.link_flair_text ?? null,
    },
    create: {
      redditId: post.id,
      authorUsername: post.author,
      title: post.title,
      selftext: post.selftext ?? "",
      flair: post.link_flair_text ?? null,
      score: post.score,
      upvoteRatio: post.upvote_ratio,
      commentCount: post.num_comments,
      permalink: post.permalink,
      createdAtReddit,
    },
  });

  // Detect completion
  const detection = detectDareType(post);
  if (detection.type === "none") return 0;

  const dgwPost = await prisma.dgwPost.findUnique({ where: { redditId: post.id } });
  if (!dgwPost) return 0;

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
