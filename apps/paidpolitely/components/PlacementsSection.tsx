import { SectionShell } from "./SectionShell";

const placements = [
  {
    name: "Homepage banners",
    size: "970×250 / responsive",
    text: "High-visibility sponsor placements near the top of community companion sites.",
  },
  {
    name: "Leaderboard and profile slots",
    size: "728×90 / 300×250",
    text: "Contextual inventory near rankings, creator profiles, and high-intent browsing paths.",
  },
  {
    name: "Community packages",
    size: "custom",
    text: "Private deals across one subreddit site or a bundle of related PaidPolitely properties.",
  },
];

export function PlacementsSection() {
  return (
    <SectionShell
      eyebrow="Display inventory"
      title="Simple placements that sponsors can understand."
      intro="The MVP is deliberately direct: book a slot, run a creative, track views and clicks, and keep the sponsor experience clean."
    >
      <div className="placement-grid">
        {placements.map((placement) => (
          <article className="placement-card" key={placement.name}>
            <div className="placement-art" aria-hidden="true"><span /></div>
            <h3>{placement.name}</h3>
            <p className="placement-size">{placement.size}</p>
            <p>{placement.text}</p>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
