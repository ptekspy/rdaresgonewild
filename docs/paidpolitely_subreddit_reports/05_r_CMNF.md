# r/CMNF Research Report

Accessed: 2026-07-02

Source pages checked:

- `https://www.reddit.com/r/CMNF/about.json`
- `https://www.reddit.com/r/CMNF/hot/`
- `https://www.reddit.com/r/CMNF/new/`
- `https://www.reddit.com/r/CMNF/top/?t=month`
- `https://www.reddit.com/r/CMNF/wiki/index`

## 1. Executive read

`r/CMNF` is a long-running, restricted adult subreddit around the “clothed male, nude female” theme. It is older than most candidates and has a clear, simple content rule: the scene should include at least one clothed male and at least one nude adult female.

It is highly adjacent to the public/exhibitionist crosspost network, but its product premise is different. It is not primarily “dare” or “public-flashing”; it is a specific scene dynamic that can be indoor, outdoor, party, hotel-room, public, or staged.

For PaidPolitely, this is a useful sibling site, but it should not copy the `rdaresgonewild` challenge UX too closely. It should be a themed gallery/directory with crosspost and creator emphasis.

## 2. Subreddit mechanics

Observed mechanics:

| Area | Observation |
|---|---|
| Community type | Restricted |
| Adult content | Yes |
| Posting | Approved contributors / restricted |
| Wiki | Disabled |
| Link flair | Not a major visible structuring feature in sampled pages |
| Submission type | Link-focused in `about.json` |
| Native videos | Reported disabled in `about.json` |
| Core rule | Adult female nude, male clothed; CMNF scene dynamic |
| Suggested role in network | Strong thematic sibling, less direct than public-flashing subs |

The `about.json` sidebar text also contains older host wording, but the rendered page rules provide the more useful operating model.

## 3. Rules and moderation model

Visible rules follow the CrossPostNetwork style.

1. **Crosspost please.** If content already exists on Reddit, crosspost it rather than duplicating. Otherwise post to a personal subreddit and crosspost.
2. **Personal rights, copyright, and law.** No revenge porn, creepshots, copyright infringement, or unauthorised reposting. The subreddit references Reddit rules, legal compliance, and 2257-style adult verification ideals.
3. **Female and 18+.** The nude person must be an adult female. The image must contain at least one clothed male and one nude female.
4. **Be nice.** The rules discourage hostility, false reports, intrusive identity/location questions, crude fantasy comments, copy-paste comments, and non-English moderation issues.
5. **Self-promotion and spam controls.** Original creators can self-promote in comments only under framework conditions. Sellers are welcome, small username watermarks are tolerated, and reposting is discouraged.
6. **Framework rules for promo.** No self-promo in titles; comments only; OP only; promo must relate to the content; Reddit profile and own paysite links are acceptable; special offers require modmail.
7. **Respect Reddit and mods.** Sitewide rules and mod discretion are explicitly referenced.

The rules are creator-friendly but controlled, similar to `r/ExhibitionistGirl` and `r/onlyonenaked`.

## 4. Wiki, sidebar, highlights, and cross-network signals

The wiki is disabled.

Visible highlight:

- Crossnetwork Bingo Challenge.

Visible friend/crosspost communities include:

- `r/RealPublicNudity`
- `r/daresgonewild`
- `r/ExhibitionistGirl`
- `r/onlyonenaked`
- `r/FlashingAndFlaunting`
- `r/outdoorgirls`
- `r/BralessForever`
- `r/CrossPostNetwork`

This places `r/CMNF` firmly inside the same ecosystem.

## 5. Hot/New/Top observed content patterns

### Hot feed

Hot content includes:

- CMNF sightseeing or public-location posts;
- party/hotel/indoor scenes;
- outdoor/public scenes;
- “nude wife” style creator posts;
- Crossnetwork Bingo posts;
- repeated creator/couple posting.

The visual pattern is broader than public-only subs. It can be indoor or outdoor as long as the CMNF dynamic is present.

### New feed

New content follows the same crosspost/creator pattern. Some posts are from the same creator ecosystem that appears in adjacent subreddits.

### Top this month

Top-month examples included public/city, outdoor, dinner/sightseeing, and social-setting CMNF posts. Successful titles often emphasise the scene dynamic rather than a pure location or dare.

## 6. What this means for a PaidPolitely standalone site

Suggested standalone angle:

> CMNF Reddit posts organised by scene, creator, setting, and popularity.

Recommended MVP pages:

- `/`
- `/new`
- `/top/week`
- `/top/month`
- `/creators`
- `/creator/[username]`
- `/tags/public`
- `/tags/party`
- `/tags/outdoor`
- `/tags/hotel`
- `/tags/couples`
- `/tags/crossnetwork-bingo`
- `/advertise`

Recommended filters/tags:

- Public CMNF
- Indoor CMNF
- Party/social
- Outdoor
- Hotel/travel
- Couples
- Crosspost
- Creator OC

Product notes:

- Avoid treating it as only public nudity; indoor/social CMNF is legitimate for this subreddit.
- Creator/couple pages are important.
- Tagging must identify whether the CMNF scene dynamic is obvious from title/flair/media metadata.
- Strong advertiser fit for creator platforms, couples/collab creator services, adult traffic, verification, editing, and watermarks.

## 7. Build recommendation

This is a good mid-pack site: strong enough to build, but it needs a distinct theme.

Potential domain/site identity:

- `rcmnf.com`
- clean category navigation by scene type;
- creator/couple discovery;
- cross-network modules showing overlapping authors in `r/onlyonenaked`, `r/RealPublicNudity`, and `r/ExhibitionistGirl`.
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
