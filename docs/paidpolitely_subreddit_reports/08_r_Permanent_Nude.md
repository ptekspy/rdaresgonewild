# r/Permanent_Nude Research Report

Accessed: 2026-07-02

Source pages checked:

- `https://www.reddit.com/r/Permanent_Nude/about.json`
- `https://www.reddit.com/r/Permanent_Nude/hot/`
- `https://www.reddit.com/r/Permanent_Nude/new/`
- `https://www.reddit.com/r/Permanent_Nude/top/?t=month`
- `https://www.reddit.com/r/Permanent_Nude/wiki/index`

## 1. Executive read

`r/Permanent_Nude` is the most unique candidate in the list. It is not a simple image gallery subreddit. It blends exhibitionism, CMNF, caption/story posts, fictional/legal-nude-world framing, and real-life public-nudity/location discussion.

The subreddit’s own rules say that photo posts should include a story and that repetitive photo-only posting is not welcome. This makes it a weaker “drop-in” fit for the existing `rdaresgonewild.com` card-grid model, but a potentially interesting standalone editorial/community concept.

For PaidPolitely, this is a niche site that would require bespoke product decisions around stories, captions, text posts, and fictional worldbuilding. Do not treat it as another public-flashing gallery.

## 2. Subreddit mechanics

Observed mechanics:

| Area | Observation |
|---|---|
| Community type | Restricted |
| Adult content | Yes |
| Posting | Must be approved to post, per public description |
| Wiki | Disabled |
| Link flair | Less central than rules/story premise |
| Galleries | Reported disabled in `about.json` |
| Submission type | Any, including text/story-style posts |
| Original content tag | Enabled |
| Core premise | Permanent nude / CMNF / ENF / story-caption worldbuilding |
| Suggested role in network | Niche editorial/story site, not direct clone |

The public description explicitly asks posters to read the sticky before posting and to include something of a story with pictures or videos.

## 3. Rules and moderation model

Visible rules are distinct from the CrossPostNetwork template.

1. **No repetitive photo posts.** The subreddit discourages profiles dominated by one repetitive photo type. It wants a broader presentation of the person/concept.
2. **Include stories with photos.** All photos should include an evocative story explaining the Permanent Nude status. The story should avoid sex/bawdy framing.
3. **Links are conditional.** Links are welcome only when paired with a photo/story that fits the subreddit. Links should appear in comments, not titles. Artist links are more welcome than general site/file-locker links.

The sidebar also describes a fictional/roleplay “Permanent Nude society” premise where adult women may be permanently nude by choice or by fictional law. This is core to the subreddit’s identity.

Another visible note states that dares are assumed legal/safe and mods are not the police. For a standalone site, do not copy that casually. Use stronger legal/safety disclaimer language.

## 4. Wiki, sidebar, highlights, and cross-network signals

The wiki is disabled, but the subreddit includes visible highlight/sticky concepts such as:

- Crossnetwork Bingo Challenge;
- a “Real Life Legal Nude Locations Wiki” post;
- a fictional guiding-law/social premise;
- photographer/creator links.

This is a text-heavy, lore-heavy subreddit compared with the other candidates.

## 5. Hot/New/Top observed content patterns

### Hot feed

Hot feed content includes a mixture of:

- story/caption posts;
- fictional “Permanent Nude” scenarios;
- public or legal-nude-location discussion;
- crossnetwork challenge posts;
- photos with narrative framing;
- AI/caption-adjacent or image-hosting discussion content.

This is not simply “latest image posts”.

### New feed

New feed structure is similarly varied: captions, stories, scenario posts, crossposts, and visual posts with required narrative context.

### Top this month

Top-month sampled posts were few and highly niche: story/legal-nude premise posts and public/permanent-nude exploration concepts. This suggests lower volume than the big public-flashing communities.

## 6. What this means for a PaidPolitely standalone site

Suggested standalone angle:

> Permanent-nude stories, captions, and CMNF-style posts from Reddit, organised by scenario and creator.

Recommended MVP pages:

- `/`
- `/new`
- `/top/month`
- `/stories`
- `/captions`
- `/posts/photo-stories`
- `/legal-nude-locations`
- `/creators`
- `/creator/[username]`
- `/tags/cmnf`
- `/tags/story`
- `/tags/caption`
- `/tags/public`
- `/advertise`

Recommended filters/tags:

- Story
- Caption
- Photo story
- CMNF
- Fictional law
- Legal nude location
- Public
- Crossnetwork Bingo
- Creator/photographer

Product notes:

- Needs text-post support and story previews.
- Needs a stronger editor-like layout, not only Masonry image grid.
- Could support “read time”, story snippets, and content-type tabs.
- Must avoid copying user stories wholesale beyond Reddit embed/link/display rules; store titles/snippets conservatively.
- Lower immediate ad value than `FlashingAndFlaunting` or `RealPublicNudity`, but high uniqueness.

## 7. Build recommendation

Build later, unless you specifically want a more editorial/story-led NSFW niche.

Potential domain/site identity:

- `rpermanentnude.com`
- story/caption-first UI;
- dedicated pages for fictional premise and legal-location discussion;
- careful compliance wording;
- not a direct reskin of `rdaresgonewild.com`.
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
