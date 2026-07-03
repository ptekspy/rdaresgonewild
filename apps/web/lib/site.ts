export type SiteMode = "dare-tracker" | "reddit-board";

export interface SiteConfig {
  key: string;
  mode: SiteMode;
  themeClass: string;
  name: string;
  shortName: string;
  subreddit: string;
  subredditDisplay: string;
  domain: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  brand: {
    logo: string;
    mark: string;
    favicon: string;
    socialImage: string;
  };
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
    themeClass: "site-rdaresgonewild",
    name: "r/DARES Gone Wild",
    shortName: "r/DARES",
    subreddit: "daresgonewild",
    subredditDisplay: "r/daresgonewild",
    domain: "rdaresgonewild.com",
    description: "Track your r/daresgonewild playbook progress, climb the leaderboard, and get your next dare.",
    themeColor: "#090b16",
    backgroundColor: "#090b16",
    brand: {
      logo: "/brand/rdgw-logo-horizontal-color-white.png",
      mark: "/brand/rdgw-flame-icon-color.png",
      favicon: "/brand/favicon.ico",
      socialImage: "/brand/social-avatar-1024x1024.png",
    },
    nav: [
      { href: "/timeline", label: "Timeline" },
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/dares", label: "Playbook" },
    ],
  },
  rflashingandflaunting: {
    key: "rflashingandflaunting",
    mode: "reddit-board",
    themeClass: "site-rflashingandflaunting",
    name: "r/FlashingAndFlaunting",
    shortName: "F&F",
    subreddit: "FlashingAndFlaunting",
    subredditDisplay: "r/FlashingAndFlaunting",
    domain: "rflashingandflaunting.com",
    description: "A bright public-flashing discovery board for r/FlashingAndFlaunting creators, posts, and public settings.",
    themeColor: "#07080b",
    backgroundColor: "#07080b",
    brand: {
      logo: "/brand/rff/rff-logo-horizontal.svg",
      mark: "/brand/rff/rff-mark.svg",
      favicon: "/brand/rff/favicon.svg",
      socialImage: "/brand/rff/social-avatar.svg",
    },
    nav: [
      { href: "/new", label: "New" },
      { href: "/top/month", label: "Top Month" },
      { href: "/creators", label: "Creators" },
    ],
    board: {
      kicker: "Unofficial public OC board",
      headline: "Public scenes,",
      accent: "flashbulb bright.",
      intro:
        "Browse original r/FlashingAndFlaunting posts by creator, public setting, and popularity without turning it into a dare clone.",
      primaryCta: "Browse new posts",
      tags: [
        { slug: "oc", label: "OC", terms: ["oc", "original"] },
        { slug: "public", label: "Public", terms: ["public", "outside", "outdoor", "street", "open"] },
        { slug: "shopping", label: "Shopping", terms: ["shop", "store", "mall", "retail", "chipotle", "mcdonald"] },
        { slug: "nightlife", label: "Nightlife", terms: ["bar", "restaurant", "cafe", "pub", "rave", "club"] },
        { slug: "travel", label: "Travel", terms: ["hotel", "balcony", "hallway", "vacation", "holiday", "cruise", "louvre", "spain"] },
        { slug: "beach", label: "Beach", terms: ["beach", "bikini", "pool", "boat"] },
        { slug: "arcade", label: "Arcade", terms: ["arcade", "game", "hoops"] },
        { slug: "transit", label: "Transit", terms: ["train", "tracks", "station", "parking", "pump", "drive through"] },
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
