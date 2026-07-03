import { advertiserBenefits, buildMailto, subredditBenefits } from "@/lib/site";

function BenefitList({ items }: { items: string[] }) {
  return (
    <ul className="benefit-list">
      {items.map((item) => (
        <li key={item}><span />{item}</li>
      ))}
    </ul>
  );
}

export function AudienceCards() {
  return (
    <section className="audience-grid" aria-label="PaidPolitely audiences">
      <article className="audience-card advertiser-card" id="advertise">
        <p className="eyebrow">For advertisers</p>
        <h2>Purchase display ads across niche adult communities.</h2>
        <p>
          Sponsor banners, sidebar units, homepage placements, and community-specific slots on sites built around
          real subreddit behaviour rather than generic adult traffic.
        </p>
        <BenefitList items={advertiserBenefits} />
        <a className="button button-primary" href={buildMailto("advertiser")}>Request ad rates</a>
      </article>

      <article className="audience-card subreddit-card" id="subreddits">
        <p className="eyebrow">For subreddit mods</p>
        <h2>Bring your subreddit into the PaidPolitely network.</h2>
        <p>
          A companion site can turn repeated posting patterns into useful discovery, progression, rankings, galleries,
          timelines, and clean sponsor inventory.
        </p>
        <BenefitList items={subredditBenefits} />
        <a className="button button-secondary" href={buildMailto("subreddit")}>Discuss a community</a>
      </article>
    </section>
  );
}
