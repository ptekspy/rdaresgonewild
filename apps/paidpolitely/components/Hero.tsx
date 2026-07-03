import { buildMailto, currentNetworkSites } from "@/lib/site";
import { BrandMark } from "./Brand";

const liveCount = currentNetworkSites.length;
const customDomainCount = currentNetworkSites.filter((site) => site.status === "custom-domain").length;

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <div className="hero-pill"><span /> Private display ads for Reddit-grown adult communities</div>
        <h1>Buy focused display ads. Bring niche subreddits into the network.</h1>
        <p>
          PaidPolitely builds companion sites for NSFW Reddit communities and sells direct, first-party display
          placements across them. Advertisers get relevant adult traffic. Subreddits get useful community tools and a
          cleaner route to monetisation.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href={buildMailto("advertiser")}>Buy display ads</a>
          <a className="button button-secondary" href={buildMailto("subreddit")}>Bring a subreddit</a>
        </div>
        <dl className="hero-stats" aria-label="Network snapshot">
          <div><dt>{customDomainCount}</dt><dd>owned domain live</dd></div>
          <div><dt>{liveCount}</dt><dd>deployed site builds</dd></div>
          <div><dt>2</dt><dd>growth paths</dd></div>
        </dl>
      </div>

      <div className="hero-card" aria-label="PaidPolitely network preview">
        <div className="hero-card-glow" />
        <div className="hero-card-top">
          <BrandMark size={58} />
          <div>
            <p className="eyebrow">Network engine</p>
            <h2>Display ads + subreddit companion sites</h2>
          </div>
        </div>
        <div className="network-mock">
          <div className="mock-bar"><span /> <strong>rdaresgonewild.com</strong><em>live</em></div>
          <div className="mock-grid">
            <span>Leaderboard</span>
            <span>Profiles</span>
            <span>Dare picker</span>
            <span>Sponsored slots</span>
          </div>
          <div className="ad-preview">
            <p>Sponsored placement</p>
            <strong>Advertise here</strong>
            <span>Reach focused adult Reddit creators and viewers.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
