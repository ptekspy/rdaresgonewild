# r/ExhibitionistGirl Research Report

Accessed: 2026-07-02

Source pages checked:

- `https://www.reddit.com/r/ExhibitionistGirl/about.json`
- `https://www.reddit.com/r/ExhibitionistGirl/hot/`
- `https://www.reddit.com/r/ExhibitionistGirl/new/`
- `https://www.reddit.com/r/ExhibitionistGirl/top/?t=month`
- `https://www.reddit.com/r/ExhibitionistGirl/wiki/index`

## 1. Executive read

`r/ExhibitionistGirl` is a creator-oriented exhibitionism subreddit, and a good PaidPolitely candidate because it sits between broad creator discovery and the more specific public-nudity/public-flashing communities.

It has clearer creator-network value than some of the other subs. The rules permit controlled self-promotion, allow seller participation within boundaries, and use recurring flairs such as `Nudes`, `Flashing`, `Gone Mild`, and `News`.

This subreddit is less “dare mechanic” and more “creator discovery with exhibitionism constraints”. That makes it a good standalone site, but it should be built with more creator profile emphasis than `r/FlashingAndFlaunting`.

## 2. Subreddit mechanics

Observed mechanics:

| Area | Observation |
|---|---|
| Community type | Restricted |
| Adult content | Yes |
| Posting | Approved contributors / verification path referenced |
| Wiki | Disabled |
| Link flair | Enabled |
| Main visible flairs | `Nudes`, `Flashing`, `Gone Mild`, `News` |
| Galleries | Allowed |
| Native videos | Reported disabled in `about.json` |
| Suggested role in network | Creator-discovery sibling site |

The page presents the subreddit as a place for adult female exhibitionist content, with publicness or other-person visibility as a defining standard.

## 3. Rules and moderation model

Visible rules are heavily aligned with the CrossPostNetwork rule style.

1. **Crossposting is encouraged; reposting is disliked.** If the content already exists on Reddit, crosspost rather than duplicating. Avoid repeatedly posting the same content across the network too quickly.
2. **Personal rights and copyright.** No revenge porn, creepshot, copyright infringement, or unauthorised reposting. The rules reference Reddit rules, national/international law, and 2257-style adult compliance.
3. **Female and 18+.** The nude/flashing subject must be female and adult.
4. **Be nice.** Comments should avoid hostility, false reports, intrusive location/identity questions, coarse fantasy commentary, and non-English moderation problems.
5. **Self-promotion and spam controls.** Verified members can self-promote in comments only, subject to framework rules. Sellers are welcome, small username watermarks are permitted, and reposting is discouraged.
6. **Framework conditions for promo.** No promo in titles; comments only; OP only; promo must relate to the post; Reddit profile and own paysite links are acceptable; special offers require mod permission.
7. **Respect Reddit and mods.** The subreddit defers to sitewide Reddit rules and mod discretion.
8. **Posting limit.** Visible rules mention a soft cap of 2–3 posts daily.
9. **Exhibitionism only.** Content should be public, with other people, or both. The public/exhibitionist nature must be obvious.
10. **No duplicate posting.** Avoid posting the same photo twice.
11. **Location privacy.** Do not ask or tell specific locations unless the OP already chose to disclose a broad location in the title.

The moderation model is balanced: creator-friendly but strict about personal rights, location/privacy, and self-promotion placement.

## 4. Wiki, sidebar, highlights, and cross-network signals

The wiki is disabled. The sidebar provides most of the rules and discovery signals.

Visible approved-contributor language points users to a “how to become approved” flow.

Visible friend/crosspost communities include:

- `r/RealPublicNudity`
- `r/outdoorgirls`
- `r/onlyonenaked`
- `r/CMNF`
- `r/ChanginginPublic`
- `r/Permanent_Nude`
- `r/BralessForever`
- `r/FlashingAndFlaunting`
- `r/daresgonewild`
- adjacent crosspost-network subs

This makes the subreddit valuable as a bridge between public-flashing subs and creator-oriented discovery.

## 5. Hot/New/Top observed content patterns

### Hot feed

Hot posts mostly use `Flashing` and `Nudes` flairs. Frequent scenes include:

- beaches and outdoor public spaces;
- roads, streets, parks, and city settings;
- travel/public transport-style scenarios;
- “gone mild” lower-intensity creator posts;
- crosspost-network content.

### New feed

New feed behaviour is similar: creator-posted image/video links, frequent short titles, and a mix of obvious public/exhibitionist setups.

### Top this month

Top-month posts leaned toward strong public or semi-public setups: travel, city, beach, running, plane/casino-style settings, and visually obvious exhibitionism. The top content is not necessarily “dare” content; it is more creator/persona-driven.

## 6. What this means for a PaidPolitely standalone site

Suggested standalone angle:

> Exhibitionist creator discovery from Reddit, organised by flair, creator, and public scenario.

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
- `/about/verification-and-rules`
- `/advertise`

Recommended filters/tags:

- Nudes
- Flashing
- Gone Mild
- Public
- Outdoor
- Beach
- City
- Travel
- Creator spotlight

Product notes:

- Make creator pages more prominent than on `rdaresgonewild`.
- Include source-subreddit and crosspost badges.
- Avoid precise location indexing.
- Consider “creator activity” metrics: recent posts, top month, cross-network presence.
- This site should be less challenge-board and more discovery/gallery plus creator directory.

## 7. Build recommendation

This is a good third or fourth site.

Potential domain/site identity:

- `rexhibitionistgirl.com`
- creator-first navigation;
- soft but bold visual style;
- advertiser positioning around creators rather than only viewers;
- strong internal links to `rflashingandflaunting`, `rrealpublicnudity`, and `rdaresgonewild` where the same author appears.
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
