export type SiteMode = "dare-tracker" | "reddit-board";

export type BoardLayoutVariant =
  | "spotlight"
  | "flair-ladder"
  | "creator-led"
  | "challenge"
  | "scene"
  | "contrast"
  | "scenic"
  | "editorial"
  | "catalog";

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
    logo?: string;
    wordmark?: string;
    tagline?: string;
    mark: string;
    favicon: string;
    socialImage: string;
  };
  nav: Array<{ href: string; label: string }>;
  board?: {
    layout: BoardLayoutVariant;
    kicker: string;
    headline: string;
    accent: string;
    intro: string;
    primaryCta: string;
    secondaryCta?: string;
    statsLabel?: string;
    browseLabel?: string;
    creatorLabel?: string;
    tags: Array<{ slug: string; label: string; terms: string[] }>;
  };
}

const sharedBoardBrand = {
  mark: "/brand/rff/rff-mark.svg",
  favicon: "/brand/rff/favicon.svg",
  socialImage: "/brand/rff/social-avatar.svg",
};

const publicTags = [
  { slug: "public", label: "Public", terms: ["public", "outside", "outdoor", "street", "open", "visible"] },
  { slug: "beach", label: "Beach", terms: ["beach", "bikini", "pool", "boat", "holiday", "vacation"] },
  { slug: "travel", label: "Travel", terms: ["hotel", "balcony", "hallway", "travel", "trip", "vacation", "holiday"] },
  { slug: "retail", label: "Retail", terms: ["shop", "store", "mall", "retail", "fitting room"] },
  { slug: "transit", label: "Transit", terms: ["train", "station", "parking", "car", "drive", "street"] },
];

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
      ...sharedBoardBrand,
    },
    nav: [
      { href: "/new", label: "New" },
      { href: "/top/month", label: "Top Month" },
      { href: "/creators", label: "Creators" },
    ],
    board: {
      layout: "spotlight",
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
  rrealpublicnudity: {
    key: "rrealpublicnudity",
    mode: "reddit-board",
    themeClass: "site-rrealpublicnudity",
    name: "r/RealPublicNudity",
    shortName: "RPN",
    subreddit: "RealPublicNudity",
    subredditDisplay: "r/RealPublicNudity",
    domain: "rrealpublicnudity.com",
    description: "A structured public-nudity board organised by creator, flair, and publicness level.",
    themeColor: "#10130f",
    backgroundColor: "#10130f",
    brand: { wordmark: "Real Public Nudity", tagline: "Flair-ranked publicness", ...sharedBoardBrand },
    nav: [
      { href: "/tags/daring", label: "Daring" },
      { href: "/tags/people-nearby", label: "People Nearby" },
      { href: "/top/month", label: "Top Month" },
    ],
    board: {
      layout: "flair-ladder",
      kicker: "Publicness ladder",
      headline: "Real public posts,",
      accent: "ranked by scenario.",
      intro: "A flair-forward index for r/RealPublicNudity, with publicness cues, creator pages, and conservative setting tags.",
      primaryCta: "Browse the ladder",
      secondaryCta: "Top public posts",
      browseLabel: "Flair-ranked posts",
      tags: [
        { slug: "crowd-pleaser", label: "Crowd Pleaser", terms: ["crowd pleaser", "crowd"] },
        { slug: "crowd-teaser", label: "Crowd Teaser", terms: ["crowd teaser", "teaser"] },
        { slug: "busted-caught", label: "Busted / Caught", terms: ["busted", "caught"] },
        { slug: "people-nearby", label: "People Nearby", terms: ["people near", "nearby", "people", "seen"] },
        { slug: "daring", label: "Daring", terms: ["daring", "dare", "risky"] },
        { slug: "building-courage", label: "Building Courage", terms: ["building courage", "courage", "nervous"] },
        ...publicTags,
      ],
    },
  },
  rexhibitionistgirl: {
    key: "rexhibitionistgirl",
    mode: "reddit-board",
    themeClass: "site-rexhibitionistgirl",
    name: "r/ExhibitionistGirl",
    shortName: "Exhibit",
    subreddit: "ExhibitionistGirl",
    subredditDisplay: "r/ExhibitionistGirl",
    domain: "rexhibitionistgirl.com",
    description: "Creator-first exhibitionist discovery from Reddit, organised by creator, flair, and public scenario.",
    themeColor: "#160914",
    backgroundColor: "#160914",
    brand: { wordmark: "Exhibitionist Girl", tagline: "Creator discovery", ...sharedBoardBrand },
    nav: [
      { href: "/creators", label: "Creators" },
      { href: "/tags/flashing", label: "Flashing" },
      { href: "/new", label: "New" },
    ],
    board: {
      layout: "creator-led",
      kicker: "Creator-first discovery",
      headline: "Follow the creators,",
      accent: "then the scenes.",
      intro: "A creator directory and gallery for r/ExhibitionistGirl posts across public, travel, city, beach, and flair-led scenarios.",
      primaryCta: "Find creators",
      secondaryCta: "Newest posts",
      creatorLabel: "Creator spotlight",
      tags: [
        { slug: "nudes", label: "Nudes", terms: ["nude", "nudes"] },
        { slug: "flashing", label: "Flashing", terms: ["flash", "flashing"] },
        { slug: "gone-mild", label: "Gone Mild", terms: ["mild", "gone mild"] },
        { slug: "city", label: "City", terms: ["city", "street", "downtown", "casino"] },
        { slug: "travel", label: "Travel", terms: ["travel", "plane", "airport", "hotel", "vacation"] },
        { slug: "beach", label: "Beach", terms: ["beach", "pool", "bikini"] },
        { slug: "running", label: "Running", terms: ["run", "running", "jog"] },
        ...publicTags.slice(0, 2),
      ],
    },
  },
  rchanginginpublic: {
    key: "rchanginginpublic",
    mode: "reddit-board",
    themeClass: "site-rchanginginpublic",
    name: "r/ChanginginPublic",
    shortName: "Change",
    subreddit: "ChanginginPublic",
    subredditDisplay: "r/ChanginginPublic",
    domain: "rchanginginpublic.com",
    description: "Public-changing and outfit-risk posts organised by scenario, creator, and challenge.",
    themeColor: "#0b1020",
    backgroundColor: "#0b1020",
    brand: {
      logo: "/brand/rchanginginpublic/rcip-logo-horizontal.svg",
      mark: "/brand/rchanginginpublic/rcip-mark.svg",
      favicon: "/brand/rchanginginpublic/favicon.svg",
      socialImage: "/brand/rchanginginpublic/social-avatar.png",
      tagline: "Outfit-risk board",
    },
    nav: [
      { href: "/tags/quick-change", label: "Quick Change" },
      { href: "/tags/outfit-swap", label: "Outfit Swap" },
      { href: "/top/week", label: "Top Week" },
    ],
    board: {
      layout: "challenge",
      kicker: "Public transition board",
      headline: "Quick changes,",
      accent: "cleanly sorted.",
      intro: "A playful scenario board for public changing, outfit swaps, crossnetwork posts, and visible-place challenges.",
      primaryCta: "Start with quick changes",
      secondaryCta: "Top challenges",
      browseLabel: "Scenario feed",
      tags: [
        { slug: "quick-change", label: "Quick Change", terms: ["quick change", "quickchange", "change fast"] },
        { slug: "outfit-swap", label: "Outfit Swap", terms: ["outfit swap", "swap", "changed outfit"] },
        { slug: "public-changing", label: "Public Changing", terms: ["changing", "changed", "public change"] },
        { slug: "fitting-room", label: "Fitting Room", terms: ["fitting", "changing room", "dressing room"] },
        { slug: "car", label: "Car / Parking", terms: ["car", "parking", "parked"] },
        { slug: "bingo", label: "Crossnetwork Bingo", terms: ["bingo", "crossnetwork", "crosspost"] },
        ...publicTags.slice(0, 3),
      ],
    },
  },
  rcmnf: {
    key: "rcmnf",
    mode: "reddit-board",
    themeClass: "site-rcmnf",
    name: "r/CMNF",
    shortName: "CMNF",
    subreddit: "CMNF",
    subredditDisplay: "r/CMNF",
    domain: "rcmnf.com",
    description: "CMNF Reddit posts organised by scene, creator, setting, and popularity.",
    themeColor: "#0d0b0a",
    backgroundColor: "#0d0b0a",
    brand: { wordmark: "CMNF Scenes", tagline: "Scene dynamics", ...sharedBoardBrand },
    nav: [
      { href: "/tags/party", label: "Party" },
      { href: "/tags/couples", label: "Couples" },
      { href: "/creators", label: "Creators" },
    ],
    board: {
      layout: "scene",
      kicker: "Scene-dynamic index",
      headline: "CMNF scenes,",
      accent: "not just locations.",
      intro: "A setting-aware r/CMNF board for public, indoor, party, travel, couples, and crosspost-friendly creator posts.",
      primaryCta: "Browse scenes",
      secondaryCta: "Creator list",
      browseLabel: "Scene feed",
      tags: [
        { slug: "public-cmnf", label: "Public CMNF", terms: ["public", "outside", "outdoor", "city"] },
        { slug: "indoor", label: "Indoor", terms: ["indoor", "inside", "home", "room"] },
        { slug: "party", label: "Party / Social", terms: ["party", "social", "dinner", "friends"] },
        { slug: "hotel", label: "Hotel / Travel", terms: ["hotel", "travel", "vacation", "sightseeing"] },
        { slug: "couples", label: "Couples", terms: ["couple", "wife", "husband", "bf", "boyfriend", "girlfriend"] },
        { slug: "crosspost", label: "Crosspost", terms: ["crosspost", "bingo", "daresgonewild"] },
        { slug: "oc", label: "Creator OC", terms: ["oc", "original"] },
      ],
    },
  },
  ronlyonenaked: {
    key: "ronlyonenaked",
    mode: "reddit-board",
    themeClass: "site-ronlyonenaked",
    name: "r/onlyonenaked",
    shortName: "One Naked",
    subreddit: "onlyonenaked",
    subredditDisplay: "r/onlyonenaked",
    domain: "ronlyonenaked.com",
    description: "Only-one-naked Reddit posts organised by creator, public or social setting, and popularity.",
    themeColor: "#0e1114",
    backgroundColor: "#0e1114",
    brand: { wordmark: "Only One Naked", tagline: "Contrast gallery", ...sharedBoardBrand },
    nav: [
      { href: "/tags/group", label: "Group" },
      { href: "/tags/social", label: "Social" },
      { href: "/top/month", label: "Top Month" },
    ],
    board: {
      layout: "contrast",
      kicker: "One nude contrast board",
      headline: "One person nude,",
      accent: "the premise stays simple.",
      intro: "A clean gallery for r/onlyonenaked, sorted by public, group, social, beach, outdoor, and couples contexts.",
      primaryCta: "Browse contrast posts",
      secondaryCta: "Top month",
      tags: [
        { slug: "one-nude", label: "One Nude", terms: ["one nude", "only one", "only naked", "one naked"] },
        { slug: "group", label: "Group", terms: ["group", "friends", "people"] },
        { slug: "social", label: "Social", terms: ["social", "party", "dinner", "bar"] },
        { slug: "couples", label: "Couples", terms: ["couple", "wife", "husband", "bf", "girlfriend"] },
        { slug: "crosspost", label: "Crosspost", terms: ["crosspost", "bingo", "daresgonewild"] },
        ...publicTags.slice(0, 3),
      ],
    },
  },
  routdoorgirls: {
    key: "routdoorgirls",
    mode: "reddit-board",
    themeClass: "site-routdoorgirls",
    name: "r/outdoorgirls",
    shortName: "Outdoor",
    subreddit: "outdoorgirls",
    subredditDisplay: "r/outdoorgirls",
    domain: "routdoorgirls.com",
    description: "Outdoor NSFW Reddit posts organised by setting, creator, flair, and popularity.",
    themeColor: "#07120d",
    backgroundColor: "#07120d",
    brand: { wordmark: "Outdoor Girls", tagline: "Open-air gallery", ...sharedBoardBrand },
    nav: [
      { href: "/tags/beach", label: "Beach" },
      { href: "/tags/woods", label: "Woods" },
      { href: "/tags/water", label: "Water" },
    ],
    board: {
      layout: "scenic",
      kicker: "Scenic outdoor index",
      headline: "Open-air posts,",
      accent: "sorted by setting.",
      intro: "A scenic r/outdoorgirls board for beaches, woods, trails, hot springs, water, nature, and creator-led outdoor posts.",
      primaryCta: "Browse outdoor posts",
      secondaryCta: "Top landscapes",
      browseLabel: "Outdoor feed",
      tags: [
        { slug: "nudes", label: "Nudes", terms: ["nude", "nudes"] },
        { slug: "flashing", label: "Flashing", terms: ["flash", "flashing"] },
        { slug: "gone-mild", label: "Gone Mild", terms: ["mild", "gone mild"] },
        { slug: "beach", label: "Beach", terms: ["beach", "sand", "coast"] },
        { slug: "woods", label: "Woods", terms: ["woods", "forest", "trees"] },
        { slug: "hiking", label: "Hiking / Trails", terms: ["hike", "hiking", "trail", "walk"] },
        { slug: "water", label: "Water / Hot Spring", terms: ["water", "spring", "hot spring", "lake", "river"] },
        { slug: "nature", label: "Nature", terms: ["nature", "outdoor", "outside"] },
      ],
    },
  },
  rpermanentnude: {
    key: "rpermanentnude",
    mode: "reddit-board",
    themeClass: "site-rpermanentnude",
    name: "r/Permanent_Nude",
    shortName: "Perm Nude",
    subreddit: "Permanent_Nude",
    subredditDisplay: "r/Permanent_Nude",
    domain: "rpermanentnude.com",
    description: "Permanent-nude stories, captions, and CMNF-style Reddit posts organised by scenario and creator.",
    themeColor: "#120c18",
    backgroundColor: "#120c18",
    brand: { wordmark: "Permanent Nude", tagline: "Stories and scenarios", ...sharedBoardBrand },
    nav: [
      { href: "/tags/story", label: "Stories" },
      { href: "/tags/caption", label: "Captions" },
      { href: "/tags/cmnf", label: "CMNF" },
    ],
    board: {
      layout: "editorial",
      kicker: "Editorial scenario index",
      headline: "Stories, captions,",
      accent: "and nude-world ideas.",
      intro: "A text-friendly r/Permanent_Nude reader for stories, captions, photo-stories, CMNF setups, and fictional law premises.",
      primaryCta: "Read new stories",
      secondaryCta: "Top concepts",
      browseLabel: "Story feed",
      tags: [
        { slug: "story", label: "Story", terms: ["story", "part ", "chapter", "tale"] },
        { slug: "caption", label: "Caption", terms: ["caption", "captions"] },
        { slug: "photo-story", label: "Photo Story", terms: ["photo story", "photostory", "pics", "gallery"] },
        { slug: "cmnf", label: "CMNF", terms: ["cmnf", "clothed", "naked female"] },
        { slug: "fictional-law", label: "Fictional Law", terms: ["law", "legal", "illegal", "permanent"] },
        { slug: "legal-nude", label: "Legal Nude Location", terms: ["legal nude", "nude location", "naked city"] },
        { slug: "public", label: "Public", terms: ["public", "outside", "street"] },
      ],
    },
  },
  rbralessforever: {
    key: "rbralessforever",
    mode: "reddit-board",
    themeClass: "site-rbralessforever",
    name: "r/BralessForever",
    shortName: "Braless",
    subreddit: "BralessForever",
    subredditDisplay: "r/BralessForever",
    domain: "rbralessforever.com",
    description: "Braless creator and model posts from Reddit, organised by model/category and popularity.",
    themeColor: "#150b10",
    backgroundColor: "#150b10",
    brand: { wordmark: "Braless Forever", tagline: "Model-led catalog", ...sharedBoardBrand },
    nav: [
      { href: "/creators", label: "Models" },
      { href: "/tags/branded", label: "Brand Posts" },
      { href: "/top/month", label: "Top Month" },
    ],
    board: {
      layout: "catalog",
      kicker: "Model-led catalog",
      headline: "Braless posts,",
      accent: "kept catalog-clean.",
      intro: "A cautious r/BralessForever index focused on models, branded posts, everyday public settings, and top-month discovery.",
      primaryCta: "Browse models",
      secondaryCta: "Latest posts",
      creatorLabel: "Models",
      tags: [
        { slug: "branded", label: "Brand Post", terms: ["braless forever", "brand", "official"] },
        { slug: "new-video", label: "New Video", terms: ["new video", "video"] },
        { slug: "model", label: "Model", terms: ["model", "featuring"] },
        { slug: "public", label: "Public / Everyday", terms: ["public", "street", "everyday", "outfit"] },
        { slug: "top-month", label: "Top Month", terms: ["top month", "popular"] },
      ],
    },
  },
};

export const SITE_KEYS = Object.keys(SITE_CONFIGS);
export const ALL_CRAWLED_SUBREDDITS = SITE_KEYS.map((key) => SITE_CONFIGS[key].subreddit);

export function getSiteConfig() {
  const key = (process.env.NEXT_PUBLIC_SITE_KEY ?? process.env.SITE_KEY ?? "rdaresgonewild").toLowerCase();
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
