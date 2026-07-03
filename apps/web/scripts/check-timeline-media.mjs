import assert from "node:assert/strict";
import { hasRedgifsUrl, selectTimelinePreview } from "../lib/timeline-media.ts";

assert.equal(hasRedgifsUrl("https://redgifs.com/watch/example", []), true);
assert.equal(hasRedgifsUrl("https://i.redgifs.com/i/example.jpg", []), true);
assert.equal(hasRedgifsUrl(null, ["https://media.redgifs.com/Example-poster.jpg"]), true);
assert.equal(hasRedgifsUrl("https://i.redd.it/example.jpg", []), false);

assert.equal(
  selectTimelinePreview({
    thumbnailUrl: "https://preview.redd.it/thumb.jpeg?width=140",
    imageUrls: ["https://i.redd.it/original.jpeg"],
    mediaUrls: ["https://media.redgifs.com/FancyExample-poster.jpg"],
  }),
  "https://media.redgifs.com/FancyExample-poster.jpg"
);

assert.equal(
  selectTimelinePreview({
    thumbnailUrl: "https://preview.redd.it/thumb.jpeg?width=140",
    imageUrls: ["https://i.redd.it/original.jpeg"],
    mediaUrls: [],
  }),
  "https://preview.redd.it/thumb.jpeg?width=140"
);

assert.equal(
  selectTimelinePreview({
    imageUrls: ["https://i.redd.it/original.webp"],
    mediaUrls: [],
  }),
  "https://i.redd.it/original.webp"
);

assert.equal(selectTimelinePreview({ mediaUrls: ["https://redgifs.com/watch/example"] }), null);

console.log("timeline media helper checks passed");
