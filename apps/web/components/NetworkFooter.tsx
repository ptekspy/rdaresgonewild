import Link from "next/link";
import type { SiteConfig } from "@/lib/site";

interface NetworkFooterProps {
    site: SiteConfig;
    networkSites: Array<{
        key: string;
        name: string;
        shortName: string;
        domain: string;
        description: string;
        themeClass: string;
        subredditDisplay: string;
    }>;
}

export function NetworkFooter({ site, networkSites }: NetworkFooterProps) {
    return (
        <footer className="paidpolitely-network-footer mt-16 border-t py-10">
            <div className="rdgw-page-shell space-y-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="max-w-2xl space-y-2">
                        <p className="rdgw-kicker w-fit">Paid Politely Network</p>
                        <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                            More NSFW Reddit companion sites
                        </h2>
                        <p className="text-sm leading-6 text-zinc-400">
                            Browse the rest of the Paid Politely network. This footer hides{" "}
                            <span className="font-semibold text-zinc-200">{site.name}</span> because you are already here.
                        </p>
                    </div>

                    <a
                        href="https://paidpolitely.com"
                        className="rdgw-button-secondary px-4 py-2 text-sm"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        PaidPolitely.com
                    </a>
                </div>

                <div className="paidpolitely-network-grid">
                    {networkSites.map((networkSite) => (
                        <a
                            key={networkSite.key}
                            href={`https://${networkSite.domain}`}
                            className="paidpolitely-network-card group"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <span className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">
                                {networkSite.subredditDisplay}
                            </span>

                            <span className="mt-2 block text-lg font-black text-white transition-colors group-hover:text-[var(--link-hover)]">
                                {networkSite.shortName}
                            </span>

                            <span className="mt-2 line-clamp-2 block text-sm leading-5 text-zinc-400">
                                {networkSite.description}
                            </span>

                            <span className="mt-4 inline-flex text-sm font-bold text-[var(--link)] transition-colors group-hover:text-[var(--link-hover)]">
                                Visit {networkSite.domain} →
                            </span>
                        </a>
                    ))}
                </div>

                <div className="flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center justify-center gap-3 md:justify-start">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={site.brand.mark}
                            alt=""
                            aria-hidden="true"
                            className="site-footer-mark h-9 w-auto opacity-80"
                        />
                        <p>
                            {site.name} — Unofficial fan site. Content indexed from{" "}
                            <a
                                href={`https://reddit.com/${site.subredditDisplay}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rdgw-link"
                            >
                                {site.subredditDisplay}
                            </a>
                            .
                        </p>
                    </div>

                    <p>© {new Date().getFullYear()} Paid Politely Network</p>
                </div>
            </div>
        </footer>
    );
}