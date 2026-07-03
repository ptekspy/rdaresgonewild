import { currentNetworkSites, siteConfig } from "@/lib/site";
import { SectionShell } from "./SectionShell";

export function NetworkSection() {
  return (
    <SectionShell
      id="network"
      eyebrow="Current footprint"
      title="One custom domain live, with a growing preview network behind it."
      intro="The public network can stay polished while previews are tested, themed, and promoted into proper domains when they prove useful."
    >
      <div className="network-grid">
        {currentNetworkSites.map((site) => {
          const shouldLink = site.status === "custom-domain" || siteConfig.showPreviewSiteLinks;
          const content = (
            <>
              <div className="site-card-top">
                <span className={site.status === "custom-domain" ? "status live" : "status preview"}>
                  {site.status === "custom-domain" ? "Custom domain" : "Preview"}
                </span>
                <span className="subreddit-label">{site.subreddit}</span>
              </div>
              <h3>{site.name}</h3>
              <p>{site.summary}</p>
            </>
          );

          return shouldLink ? (
            <a className="site-card" href={site.url} key={site.url} rel="noreferrer" target="_blank">
              {content}
            </a>
          ) : (
            <article className="site-card" key={site.url}>{content}</article>
          );
        })}
      </div>
    </SectionShell>
  );
}
