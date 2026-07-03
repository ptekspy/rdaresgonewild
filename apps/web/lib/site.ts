export type SiteMode = "dare-tracker" | "reddit-board";

export interface SiteConfig {
  key: string;
  mode: SiteMode;
  name: string;
  shortName: string;
  subreddit: string;
  subredditDisplay: string;
  domain: string;
  description: string;
  nav: Array<{ href: string; label: string }>;
  board?: {
    kicker: string;
    headline: string;
    accent: string;
    intro: string;
    primaryCta: string;
    tags: Array<{ slug: string; label: string; terms: string[] }>;
  };
}

const SITE_CONFIGS: Record<string, SiteConfig> = {
  rdaresgonewild: {
    key: "rdaresgonewild",
    mode: "dare-tracker",
    name: "r/DARES Gone Wild",
    shortName: "r/DARES",
    subreddit: "daresgonewild",
    subredditDisplay: "r/daresgonewild",
    domain: "rdaresgonewild.com",
    description: "Track your r/daresgonewild playbook progress, climb the leaderboard, and get your next dare.",
    nav: [
      { href: "/timeline", label: "Timeline" },
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/dares", label: "Playbook" },
    ],
  },
  rflashingandflaunting: {
    key: "rflashingandflaunting",
    mode: "reddit-board",
    name: "r/FlashingAndFlaunting",
    shortName: "F&F",
    subreddit: "FlashingAndFlaunting",
    subredditDisplay: "r/FlashingAndFlaunting",
    domain: "rflashingandflaunting.com",
    description: "A public-flashing and flaunting discovery board for Reddit creators, posts, and settings.",
    nav: [
      { href: "/new", label: "New" },
      { href: "/top/month", label: "Top Month" },
      { href: "/creators", label: "Creators" },
    ],
    board: {
      kicker: "Unofficial r/FlashingAndFlaunting board",
      headline: "Public posts, creator-first.",
      accent: "Flaunt the feed.",
      intro:
        "Browse original public-facing posts from Reddit, organized by creator, setting, and popularity.",
      primaryCta: "Browse new posts",
      tags: [
        { slug: "oc", label: "OC", terms: ["oc", "original"] },
        { slug: "public", label: "Public", terms: ["public", "outside", "outdoor", "street"] },
        { slug: "shopping", label: "Shopping", terms: ["shop", "store", "mall", "retail"] },
        { slug: "beach", label: "Beach", terms: ["beach", "holiday", "vacation", "pool"] },
        { slug: "car", label: "Car/Parking", terms: ["car", "parking", "garage"] },
        { slug: "bar", label: "Bar/Restaurant", terms: ["bar", "restaurant", "cafe", "pub"] },
      ],
    },
  },
};

export function getSiteConfig() {
  const key = process.env.NEXT_PUBLIC_SITE_KEY ?? process.env.SITE_KEY ?? "rdaresgonewild";
  return SITE_CONFIGS[key] ?? SITE_CONFIGS.rdaresgonewild;
}

export function getBoardTag(slug: string) {
  return getSiteConfig().board?.tags.find((tag) => tag.slug === slug) ?? null;
}

export function getPostImage(post: { imageUrls: string[]; thumbnailUrl: string | null }) {
  return post.imageUrls[0] ?? post.thumbnailUrl ?? null;
}

export function getPostTagSlugs(post: { title: string; flair: string | null }) {
  const board = getSiteConfig().board;
  if (!board) return [];

  const haystack = `${post.title} ${post.flair ?? ""}`.toLowerCase();
  return board.tags
    .filter((tag) => tag.terms.some((term) => haystack.includes(term.toLowerCase())))
    .map((tag) => tag.slug);
}
