export type Audience = "advertiser" | "subreddit";

export type NetworkSite = {
  name: string;
  subreddit: string;
  url: string;
  status: "custom-domain" | "preview";
  summary: string;
};

export const siteConfig = {
  name: process.env.NEXT_PUBLIC_NETWORK_NAME ?? "PaidPolitely",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://paidpolitely.com",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "ads@paidpolitely.com",
  adsApiUrl: process.env.NEXT_PUBLIC_ADS_API_URL ?? "https://ads.paidpolitely.com",
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "https://api.paidpolitely.com",
  analyticsUrl: process.env.NEXT_PUBLIC_ANALYTICS_URL ?? "https://analytics.paidpolitely.com",
  showPreviewSiteLinks: process.env.NEXT_PUBLIC_SHOW_PREVIEW_SITE_LINKS === "true",
};

export const currentNetworkSites: NetworkSite[] = [
  {
    name: "r/DaresGoneWild Tracker",
    subreddit: "r/daresgonewild",
    url: "https://rdaresgonewild.com/",
    status: "custom-domain",
    summary: "The first live proof point: dares, leaderboard, profiles, and community progression.",
  },
  {
    name: "Changing in Public Board",
    subreddit: "r/ChanginginPublic",
    url: "https://paidpolitely-rchanginginpublic.vercel.app/",
    status: "preview",
    summary: "A reskinned community board prototype for public-change themed submissions.",
  },
  {
    name: "Only One Naked Board",
    subreddit: "r/onlyonenaked",
    url: "https://paidpolitely-ronlyonenaked.vercel.app/",
    status: "preview",
    summary: "A candidate companion board for group/asymmetric-nudity themed community content.",
  },
  {
    name: "Preview Board Nu",
    subreddit: "network preview",
    url: "https://rdaresgonewild-web-nu.vercel.app/",
    status: "preview",
    summary: "Live Vercel preview used to test another subreddit fit and site configuration.",
  },
  {
    name: "Preview Board 9e59",
    subreddit: "network preview",
    url: "https://rdaresgonewild-web-9e59.vercel.app/",
    status: "preview",
    summary: "Live Vercel preview used to validate the reusable board template.",
  },
  {
    name: "Preview Board RRPN",
    subreddit: "network preview",
    url: "https://rdaresgonewild-web-rrpn.vercel.app/",
    status: "preview",
    summary: "Live Vercel preview for a candidate PaidPolitely community site.",
  },
  {
    name: "Preview Board J88G",
    subreddit: "network preview",
    url: "https://rdaresgonewild-web-j88g.vercel.app/",
    status: "preview",
    summary: "Live Vercel preview for testing site-specific theming and placements.",
  },
  {
    name: "Preview Board 58K6",
    subreddit: "network preview",
    url: "https://rdaresgonewild-web-58k6.vercel.app/",
    status: "preview",
    summary: "Live Vercel preview for another potential network board.",
  },
  {
    name: "Preview Board 8IUF",
    subreddit: "network preview",
    url: "https://rdaresgonewild-web-8iuf.vercel.app/",
    status: "preview",
    summary: "Live Vercel preview for repeatable site deployment checks.",
  },
  {
    name: "Preview Board U7LB",
    subreddit: "network preview",
    url: "https://rdaresgonewild-web-u7lb.vercel.app/",
    status: "preview",
    summary: "Live Vercel preview for candidate subreddit onboarding.",
  },
];

export const advertiserBenefits = [
  "Display placements across focused NSFW Reddit-adjacent sites.",
  "Direct bookings instead of broad programmatic adult traffic.",
  "Community-aware inventory with visible sponsored labelling.",
  "Simple banner, sidebar, and takeover-style packages.",
];

export const subredditBenefits = [
  "A companion site that can add leaderboards, galleries, stats, challenges, and profiles.",
  "A way to give regular contributors more visibility without changing subreddit culture.",
  "Potential network revenue once the site has useful traffic and clean placements.",
  "Shared infrastructure, analytics, and ad operations handled by PaidPolitely.",
];

export function buildMailto(audience: Audience) {
  const subject =
    audience === "advertiser"
      ? "Display ads on PaidPolitely"
      : "Bring my subreddit to PaidPolitely";

  const body =
    audience === "advertiser"
      ? [
          "Hi PaidPolitely,",
          "",
          "I'd like to buy display ads across the PaidPolitely network.",
          "",
          "Brand/company:",
          "Website:",
          "Budget or dates:",
          "Preferred audience/community:",
          "Creative size or format:",
          "",
          "Thanks!",
        ]
      : [
          "Hi PaidPolitely,",
          "",
          "I'd like to discuss bringing a subreddit/community into the PaidPolitely network.",
          "",
          "Subreddit/community:",
          "Approximate audience size:",
          "What the community is known for:",
          "What a companion site should add:",
          "",
          "Thanks!",
        ];

  return `mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.join("\r\n"))}`;
}
