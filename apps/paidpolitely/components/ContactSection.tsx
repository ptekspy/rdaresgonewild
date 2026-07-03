import { buildMailto, siteConfig } from "@/lib/site";

export function ContactSection() {
  return (
    <section className="contact-section" id="contact">
      <div>
        <p className="eyebrow">Start politely</p>
        <h2>Ready to book ads or bring a subreddit onboard?</h2>
        <p>
          Email <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>. Tell us whether you are buying
          display ads or introducing a community, and include the useful details upfront.
        </p>
      </div>
      <div className="contact-actions">
        <a className="button button-primary" href={buildMailto("advertiser")}>Buy ads</a>
        <a className="button button-secondary" href={buildMailto("subreddit")}>Join network</a>
      </div>
    </section>
  );
}
