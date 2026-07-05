export type ClassifierPost = {
  title: string;
  selftext: string;
  flair: string | null;
  score: number;
  commentCount: number;
  createdAtReddit: Date;
  imageUrls: string[];
  mediaUrls: string[];
  outboundUrl: string | null;
  permalink: string;
};

export type ClassificationResult = {
  primaryType: string;
  categories: string[];
  confidence: number;
  summary: string;
  notes: string;
};

export const ALLOWED_PRIMARY_TYPES = [
  "exhibitionist",
  "dare_player",
  "creator",
  "couple",
  "seller",
  "community_participant",
  "unknown",
] as const;

export const ALLOWED_CATEGORIES = [
  "public",
  "flashing",
  "dares",
  "bratty",
  "soft",
  "explicit",
  "couple",
  "solo",
  "outdoor",
  "gym",
  "lingerie",
  "teasing",
  "verified_creator",
  "possible_advertiser",
  "high_engagement",
  "low_activity",
] as const;

export function buildClassificationPrompt(username: string, posts: ClassifierPost[]) {
  return JSON.stringify({
    task: "Classify this Reddit creator/model profile for an internal admin dashboard.",
    username,
    rules: [
      "Use only supplied post titles, text, flair, links, and engagement metadata.",
      "Do not infer age, race, health, politics, religion, location, or other protected/private traits.",
      "Do not write explicit sexual prose. Use concise admin labels only.",
      "If evidence is weak, choose primaryType=unknown and low confidence.",
      "Return strict JSON only. No markdown. No commentary.",
    ],
    allowedPrimaryTypes: ALLOWED_PRIMARY_TYPES,
    allowedCategories: ALLOWED_CATEGORIES,
    outputSchema: {
      primaryType: "one allowedPrimaryTypes value",
      categories: "array of allowedCategories values",
      confidence: "number from 0 to 1",
      summary: "one short admin sentence",
      notes: "short evidence note; no sensitive/private trait guesses",
    },
    posts: posts.map((post) => ({
      title: post.title,
      selftext: post.selftext.slice(0, 1000),
      flair: post.flair,
      score: post.score,
      commentCount: post.commentCount,
      createdAtReddit: post.createdAtReddit.toISOString(),
      hasImages: post.imageUrls.length > 0,
      hasMedia: post.mediaUrls.length > 0,
      outboundUrl: post.outboundUrl,
      permalink: post.permalink,
    })),
  });
}

export function normalizeClassificationResult(value: unknown): ClassificationResult {
  const input = isRecord(value) ? value : {};
  const primaryType = typeof input.primaryType === "string" && ALLOWED_PRIMARY_TYPES.includes(input.primaryType as never)
    ? input.primaryType
    : "unknown";

  const categories = Array.isArray(input.categories)
    ? input.categories.filter((category): category is string => (
        typeof category === "string" && ALLOWED_CATEGORIES.includes(category as never)
      ))
    : [];

  const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence)
    ? Math.max(0, Math.min(1, input.confidence))
    : 0;

  const summary = typeof input.summary === "string" ? input.summary.slice(0, 500) : "No summary returned.";
  const notes = typeof input.notes === "string" ? input.notes.slice(0, 1000) : "No notes returned.";

  return { primaryType, categories, confidence, summary, notes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
