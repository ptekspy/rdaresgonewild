import { Prisma, prisma } from "@rdgw/database";
import { createCompletionsForPost } from "./detector.js";
import type { RedditPost } from "./reddit.js";

const DEFAULT_LIMIT = 250;
const DEFAULT_SUBREDDIT = "daresgonewild";

type SavedPostForParsing = {
  id: string;
  redditId: string;
  subreddit: string;
  authorUsername: string;
  title: string;
  selftext: string;
  flair: string | null;
  score: number;
  upvoteCount: number | null;
  upvoteRatio: number | null;
  commentCount: number;
  shareCount: number | null;
  crosspostCount: number;
  mediaUrls: string[];
  imageUrls: string[];
  outboundUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string;
  createdAtReddit: Date;
};

export interface ParseSavedPostsOptions {
  subreddit?: string;
  source?: string;
  limit?: number;
  onlyWithoutCompletions?: boolean;
}

export interface ParseSavedPostsResult {
  postsChecked: number;
  completionsCreated: number;
}

export async function parseSavedPosts(
  options: ParseSavedPostsOptions = {}
): Promise<ParseSavedPostsResult> {
  const limit =
    Number.isFinite(options.limit) && options.limit && options.limit > 0
      ? Math.floor(options.limit)
      : DEFAULT_LIMIT;

  const where: Prisma.DgwPostWhereInput = {
    subreddit: { equals: options.subreddit ?? DEFAULT_SUBREDDIT, mode: "insensitive" },
  };

  if (options.source) {
    where.source = options.source;
  }

  if (options.onlyWithoutCompletions !== false) {
    where.playbookCompletions = { none: {} };
    where.communityCompletions = { none: {} };
  }

  const posts = await prisma.dgwPost.findMany({
    where,
    orderBy: { createdAtReddit: "desc" },
    take: limit,
    select: {
      id: true,
      redditId: true,
      subreddit: true,
      authorUsername: true,
      title: true,
      selftext: true,
      flair: true,
      score: true,
      upvoteCount: true,
      upvoteRatio: true,
      commentCount: true,
      shareCount: true,
      crosspostCount: true,
      mediaUrls: true,
      imageUrls: true,
      outboundUrl: true,
      thumbnailUrl: true,
      permalink: true,
      createdAtReddit: true,
    },
  });

  let completionsCreated = 0;

  for (const post of posts) {
    completionsCreated += await createCompletionsForPost(toRedditPost(post), prisma, post.id);
  }

  return {
    postsChecked: posts.length,
    completionsCreated,
  };
}

function toRedditPost(post: SavedPostForParsing): RedditPost {
  return {
    id: post.redditId,
    name: `t3_${post.redditId}`,
    subreddit: post.subreddit,
    title: post.title,
    selftext: post.selftext,
    author: post.authorUsername,
    link_flair_text: post.flair,
    score: post.score,
    upvoteCount: post.upvoteCount,
    upvote_ratio: post.upvoteRatio,
    num_comments: post.commentCount,
    shareCount: post.shareCount,
    crosspostCount: post.crosspostCount,
    mediaUrls: post.mediaUrls,
    imageUrls: post.imageUrls,
    outboundUrl: post.outboundUrl,
    thumbnailUrl: post.thumbnailUrl,
    permalink: post.permalink,
    created_utc: Math.floor(post.createdAtReddit.getTime() / 1000),
  };
}
