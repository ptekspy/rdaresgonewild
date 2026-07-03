# r/outdoorgirls Research Report

Accessed: 2026-07-02

Source pages checked:

- `https://www.reddit.com/r/outdoorgirls/about.json`
- `https://www.reddit.com/r/outdoorgirls/hot/`
- `https://www.reddit.com/r/outdoorgirls/new/`
- `https://www.reddit.com/r/outdoorgirls/top/?t=month`
- `https://www.reddit.com/r/outdoorgirls/wiki/index`

## 1. Executive read

`r/outdoorgirls` is an adult-only, restricted outdoor NSFW subreddit. It is broader and less challenge-specific than `r/daresgonewild`, but it has enough overlap with the public/exhibitionist network to be a viable PaidPolitely site.

Its strongest value is simple: outdoor creator content by setting. It is less about dares or public risk and more about nature/beach/woods/outdoor scenes.

This makes it a good visual gallery product, but not necessarily a “drop-in challenge site”. It needs its own outdoor/nature browsing identity.

## 2. Subreddit mechanics

Observed mechanics:

| Area | Observation |
|---|---|
| Community type | Restricted |
| Adult content | Yes |
| Posting | Verification required to post, visible on rendered page |
| Wiki | `about.json` says enabled, but `/wiki/index` reports no index page exists |
| Link flair | Enabled |
| Main visible flairs | `Nudes`, `Flashing`, `Gone Mild` |
| Galleries | Allowed |
| Native videos | Reported disabled in `about.json` |
| Core premise | Adult outdoor women/nature/beach/woods; no nude guys or sex per public description |
| Suggested role in network | Outdoor gallery sibling; not challenge-first |

Important note: the old sidebar text in `about.json` appears partially stale or incongruent with the current rendered community identity. The rendered page, public description, flair set, verification note, and friend list are more useful for product planning.

## 3. Rules and moderation model

The rendered page showed less detailed rule text than several sibling communities, but it did show:

- verification required to post;
- restricted adult community;
- visible flair filters;
- outdoor-girls framing;
- cross-network friend links.

The public description says:

- hot girls in the great outdoors;
- nature/beach/woods themes;
- no nude guys;
- no sex content.

For a PaidPolitely site, apply the shared network baseline:

- adult/verified creator expectation;
- no unauthorised reposts;
- no personal or precise location surfacing;
- no minors or identifiable bystanders;
- no explicit sex category if the subreddit excludes it;
- respect flair distinctions between nudes, flashing, and gone mild.

## 4. Wiki, sidebar, highlights, and cross-network signals

The wiki setting appears enabled, but `/wiki/index` returned that the index page does not exist.

Visible site structure includes:

- verification requirement;
- flair filters: `Nudes`, `Flashing`, `Gone Mild`;
- friend links into the same network.

Visible friend/crosspost communities include:

- `r/RealPublicNudity`
- `r/onlyonenaked`
- `r/CMNF`
- `r/BralessForever`
- `r/ExhibitionistGirl`
- `r/FlashingAndFlaunting`
- `r/daresgonewild`
- `r/CrossPostNetwork`

## 5. Hot/New/Top observed content patterns

### Hot feed

Hot content includes:

- beach posts;
- hikes and walking trails;
- woods/nature scenes;
- hot springs/water/outdoor bathing scenarios;
- outdoor flashing;
- “gone mild” lower-intensity posts;
- creator/crosspost content from adjacent communities.

The visible flairs are useful and should become first-class site filters.

### New feed

New posts follow the same pattern: outdoor scene hooks, creator-driven titles, and a mix of `Nudes`, `Flashing`, and `Gone Mild`.

### Top this month

Top-month posts strongly emphasised scenic/outdoor hooks: hot springs, beaches, walks, open-air settings, and nature/outdoor locations. The top content was less about public dare mechanics and more about outdoor aesthetic plus NSFW creator appeal.

## 6. What this means for a PaidPolitely standalone site

Suggested standalone angle:

> Outdoor NSFW Reddit posts organised by setting, creator, flair, and popularity.

Recommended MVP pages:

- `/`
- `/new`
- `/top/week`
- `/top/month`
- `/creators`
- `/creator/[username]`
- `/flair/nudes`
- `/flair/flashing`
- `/flair/gone-mild`
- `/tags/beach`
- `/tags/woods`
- `/tags/hiking`
- `/tags/water`
- `/advertise`

Recommended filters/tags:

- Nudes
- Flashing
- Gone Mild
- Beach
- Woods
- Hiking/trails
- Water/hot spring
- Nature
- Outdoor public
- Creator OC

Product notes:

- This should be a scenic/outdoor visual site, not a dare clone.
- Great place for seasonal and location-type browsing, but avoid precise geo-location.
- Better suited to broad sponsor placements than challenge-specific mechanics.
- Strong candidate for prettier UI: nature gradients, cards by setting, seasonal top posts.

## 7. Build recommendation

Build after the first public/exhibitionist group unless you want a more mainstream/softer NSFW visual site quickly.

Potential domain/site identity:

- `routdoorgirls.com`
- nature/outdoor-focused visual style;
- flair + setting navigation;
- creator pages with cross-network overlap.
---

## Suggested data model fields for this subreddit

Use the shared Reddit ingestion fields, but do not force every subreddit into the same product language.

Recommended shared fields:

```ts
export type RedditPostSnapshot = {
  subreddit: string;
  redditId: string;
  title: string;
  authorName: string;
  flairText: string | null;
  permalink: string;
  mediaKind: "image" | "gallery" | "video" | "external" | "text" | "unknown";
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  score: number;
  commentCount: number;
  over18: boolean;
  createdUtc: Date;
  isCrosspost: boolean;
  crosspostSourceSubreddit?: string;
  observedSort: "hot" | "new" | "top_month" | "top_year" | "top_all";
};
```

Subreddit-specific enrichment should happen in a separate layer, for example `subredditTags`, not by mutating the core model.
