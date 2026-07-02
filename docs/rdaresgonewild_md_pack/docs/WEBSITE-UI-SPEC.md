# Website UI Specification

## Site Positioning

r/DARES Gone Wild is a gamified dare tracker and leaderboard experience for an adult Reddit challenge community.

The product should feel like:

> A cheeky adult achievement system with leaderboard energy.

## Recommended Pages

### Home

Purpose:

- Explain the product quickly.
- Show key stats.
- Push users toward the dare picker and leaderboard.

Sections:

1. Hero
2. Stats strip
3. How it works
4. Featured leaderboard
5. Dare picker CTA
6. Footer disclaimer

### Leaderboard

Purpose:

- Rank creators by completed dares.
- Make progression feel competitive.

Recommended layout:

- Tabs: Playbook / Community / Overall
- Rank cards
- Progress bars
- Username search/filter
- Top 3 highlighted

### Dare Picker

Purpose:

- Help a user find their next uncompleted dare.

Recommended layout:

- Reddit username input
- Current progress summary
- Suggested next dare card
- “Spin again” or “Pick another” action
- Difficulty/level indicator

### Creator Profile

Purpose:

- Show a user’s dare completion history.

Recommended layout:

- Username header
- Completion stats
- Level progress
- Completed dares grid
- Next recommended dare

## Layout System

```css
.container {
  width: min(1120px, calc(100% - 32px));
  margin-inline: auto;
}
```

## Header

Recommended:

- sticky top
- dark translucent background
- subtle blur
- logo left
- nav links right
- CTA button: “Pick a Dare”

```css
.header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(9, 11, 22, 0.78);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
```

## Hero

Hero should be bold and direct.

Example structure:

- Badge: “Unofficial r/daresgonewild tracker”
- H1: “Track dares. Level up. Get wild.”
- Subcopy: “Follow playbook progress, compare creators, and find your next challenge.”
- CTAs: “Pick my next dare” and “View leaderboard”

## Cards

```css
.card {
  background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03));
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 24px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.22);
}
```

## Buttons

Primary:

```css
.button-primary {
  border-radius: 999px;
  background: linear-gradient(135deg, #F9047C 0%, #FF2C76 35%, #FF4B2B 68%, #FF7A00 100%);
  color: white;
  font-weight: 800;
}
```

Secondary:

```css
.button-secondary {
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  color: white;
}
```

## Progress Bars

```css
.progress-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(135deg, #F9047C, #FF7A00);
}
```

## Visual Motifs

Use:

- flame icon
- spark accents
- gradient progress
- leaderboard podium cues
- completion checkmarks
- level badges

Avoid:

- explicit imagery in core UI chrome
- cluttered backgrounds
- too many gradients at once
