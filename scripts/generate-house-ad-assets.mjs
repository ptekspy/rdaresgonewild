import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const outputRoot = join(root, "apps/web/public/ads");

const sites = [
  {
    key: "rdaresgonewild",
    label: "r/DARES Gone Wild",
    domain: "rdaresgonewild.com",
    colors: ["#f9047c", "#ff7a00", "#090b16"],
    motif: "dare tracker",
  },
  {
    key: "rflashingandflaunting",
    label: "r/FlashingAndFlaunting",
    domain: "rflashingandflaunting.com",
    colors: ["#30f4ff", "#ff2d8f", "#07080b"],
    motif: "neon public board",
  },
  {
    key: "rrealpublicnudity",
    label: "r/RealPublicNudity",
    domain: "rrealpublicnudity.com",
    colors: ["#b8f05a", "#f05a8a", "#10130f"],
    motif: "flair ladder",
  },
  {
    key: "rexhibitionistgirl",
    label: "r/ExhibitionistGirl",
    domain: "rexhibitionistgirl.com",
    colors: ["#ff65b7", "#8cf3ff", "#160914"],
    motif: "creator spotlight",
  },
  {
    key: "rchanginginpublic",
    label: "r/ChanginginPublic",
    domain: "rchanginginpublic.com",
    colors: ["#66e0ff", "#ff7b54", "#0b1020"],
    motif: "quick change",
  },
  {
    key: "rcmnf",
    label: "r/CMNF",
    domain: "rcmnf.com",
    colors: ["#f2d6a3", "#39d0c8", "#0d0b0a"],
    motif: "scene dynamics",
  },
  {
    key: "ronlyonenaked",
    label: "r/onlyonenaked",
    domain: "ronlyonenaked.com",
    colors: ["#f1f5f9", "#ff4f8b", "#0e1114"],
    motif: "contrast gallery",
  },
  {
    key: "routdoorgirls",
    label: "r/outdoorgirls",
    domain: "routdoorgirls.com",
    colors: ["#9be57f", "#5ac8fa", "#07120d"],
    motif: "open-air gallery",
  },
  {
    key: "rpermanentnude",
    label: "r/Permanent_Nude",
    domain: "rpermanentnude.com",
    colors: ["#d2b8ff", "#4ef0c2", "#120c18"],
    motif: "story shelves",
  },
  {
    key: "rbralessforever",
    label: "r/BralessForever",
    domain: "rbralessforever.com",
    colors: ["#ff9cb3", "#6ee7f9", "#150b10"],
    motif: "model catalog",
  },
];

const variants = [
  {
    file: "advertise-1.svg",
    eyebrow: "Sponsored slots open",
    headline: "Advertise here",
    body: "Reach a focused Reddit-grown audience",
  },
  {
    file: "advertise-2.svg",
    eyebrow: "Paid Politely network",
    headline: "Own this placement",
    body: "Creator tools, platforms, services, and sponsors welcome",
  },
  {
    file: "advertise-3.svg",
    eyebrow: "Direct response",
    headline: "Contact us to advertise",
    body: "Simple placements for brands that fit the community",
  },
];

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svg(site, variant, index) {
  const [primary, secondary, bg] = site.colors;
  const id = `${site.key}-${index}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="970" height="250" viewBox="0 0 970 250" role="img" aria-labelledby="title-${id} desc-${id}">
  <title id="title-${id}">${escapeXml(variant.headline)} on ${escapeXml(site.label)}</title>
  <desc id="desc-${id}">Themed advertising house creative for ${escapeXml(site.domain)}.</desc>
  <defs>
    <linearGradient id="bg-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="0.48" stop-color="${primary}" stop-opacity="0.34"/>
      <stop offset="1" stop-color="${secondary}" stop-opacity="0.5"/>
    </linearGradient>
    <radialGradient id="pulse-${id}" cx="${index === 1 ? "72%" : index === 2 ? "18%" : "58%"}" cy="${index === 3 ? "34%" : "50%"}" r="60%">
      <stop offset="0" stop-color="${secondary}" stop-opacity="0.9"/>
      <stop offset="0.42" stop-color="${primary}" stop-opacity="0.34"/>
      <stop offset="1" stop-color="${bg}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft-${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
  </defs>
  <rect width="970" height="250" rx="24" fill="url(#bg-${id})"/>
  <rect x="1" y="1" width="968" height="248" rx="23" fill="none" stroke="${primary}" stroke-opacity="0.36" stroke-width="2"/>
  <circle cx="${index === 1 ? 760 : index === 2 ? 170 : 650}" cy="${index === 1 ? 64 : index === 2 ? 196 : 132}" r="148" fill="url(#pulse-${id})" filter="url(#soft-${id})"/>
  <path d="M${70 + index * 18} 205 C220 ${78 + index * 18}, 340 ${232 - index * 12}, 490 108 S720 44, 895 ${160 - index * 10}" fill="none" stroke="${secondary}" stroke-opacity="0.46" stroke-width="5"/>
  <path d="M690 36 h190 a22 22 0 0 1 22 22 v134 a22 22 0 0 1-22 22 H690 a22 22 0 0 1-22-22 V58 a22 22 0 0 1 22-22Z" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.16"/>
  <g transform="translate(716 68)">
    <circle cx="36" cy="36" r="34" fill="${primary}" fill-opacity="0.2" stroke="${primary}" stroke-opacity="0.75"/>
    <circle cx="103" cy="36" r="34" fill="${secondary}" fill-opacity="0.18" stroke="${secondary}" stroke-opacity="0.75"/>
    <circle cx="69" cy="88" r="34" fill="#ffffff" fill-opacity="0.1" stroke="#ffffff" stroke-opacity="0.4"/>
  </g>
  <text x="52" y="58" fill="${primary}" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="1.2">${escapeXml(variant.eyebrow.toUpperCase())}</text>
  <text x="52" y="116" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="46" font-weight="900" letter-spacing="0">${escapeXml(variant.headline)}</text>
  <text x="52" y="154" fill="#ffffff" fill-opacity="0.82" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="650">${escapeXml(variant.body)}</text>
  <text x="52" y="205" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="900">${escapeXml(site.label)}</text>
  <text x="338" y="205" fill="${secondary}" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="900">${escapeXml(site.motif)}</text>
  <text x="728" y="205" fill="#ffffff" fill-opacity="0.92" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="900">Contact us</text>
</svg>
`;
}

for (const site of sites) {
  const dir = join(outputRoot, site.key);
  mkdirSync(dir, { recursive: true });
  variants.forEach((variant, index) => {
    writeFileSync(join(dir, variant.file), svg(site, variant, index + 1));
  });
}

console.log(`Generated ${sites.length * variants.length} themed ad image assets.`);
