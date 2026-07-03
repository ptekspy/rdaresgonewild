import { SectionShell } from "./SectionShell";

const points = [
  "No third-party advertiser JavaScript in the MVP.",
  "Sponsored placements are clearly labelled.",
  "Adult-aware categories and creative review fields are part of the platform model.",
  "Built for niche relevance instead of broad low-quality adult traffic.",
];

export function TrustSection() {
  return (
    <SectionShell
      eyebrow="Network posture"
      title="Adult-friendly without being messy."
      intro="The point is to keep the network useful for advertisers, respectful of community culture, and professional enough for mods to trust."
    >
      <div className="trust-list">
        {points.map((point) => (
          <div key={point}><span />{point}</div>
        ))}
      </div>
    </SectionShell>
  );
}
