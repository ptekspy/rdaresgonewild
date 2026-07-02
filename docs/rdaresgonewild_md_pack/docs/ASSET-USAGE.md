# Asset Usage Guide

## Primary Navbar Logo

Use the horizontal colour logo for the main navbar.

Recommended CSS:

```css
.site-logo {
  height: 40px;
  width: auto;
  display: block;
}
```

For mobile, use the flame icon alone where horizontal space is limited.

## Dark / Light Usage

### Colour logo

Best on:

- dark navy backgrounds
- neutral off-white backgrounds
- hero areas with enough contrast

### Navy logo

Use on:

- white backgrounds
- print-like mockups
- simple monochrome UI

### White logo

Use on:

- dark backgrounds
- dark gradient hero sections
- image/video overlays

## Favicon Implementation

Recommended favicon set:

```txt
favicon.ico
favicon-16x16.png
favicon-32x32.png
favicon-48x48.png
apple-touch-icon.png
android-chrome-192x192.png
android-chrome-512x512.png
```

## Next.js App Router Example

```ts
export const metadata = {
  title: "r/DARES Gone Wild",
  description: "Track dares, climb the leaderboard, and pick your next challenge.",
  icons: {
    icon: [
      { url: "/favicons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicons/favicon.ico" },
    ],
    apple: "/favicons/apple-touch-icon.png",
  },
};
```

## Do Not

- Stretch the logo.
- Add heavy shadows.
- Put the colour logo on a busy image without contrast.
- Use the flame mascot in a way that makes it explicit or vulgar.
- Replace the pink/orange gradient with random colours.
