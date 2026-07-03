import type { Metadata } from "next";
import Link from "next/link";
import { PlayAsControl } from "@/components/PlayAsControl";
import { getSiteConfig } from "@/lib/site";
import "./globals.css";

const site = getSiteConfig();

export const metadata: Metadata = {
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.description,
  metadataBase: new URL(`https://${site.domain}`),
  icons: {
    icon: site.brand.favicon,
    apple: site.brand.mark,
  },
  openGraph: {
    title: site.name,
    description: site.description,
    siteName: site.name,
    images: [{ url: site.brand.socialImage, width: 1024, height: 1024, alt: site.name }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const site = getSiteConfig();

  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-title" content={site.shortName} />
      </head>
      <body className={`${site.themeClass} min-h-screen flex flex-col antialiased`}>
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="site-ambient site-ambient-one" />
          <div className="site-ambient site-ambient-two" />
          <div className="site-ambient-line" />
        </div>

        <header className="site-header sticky top-0 z-40 border-b backdrop-blur-xl">
          <div className="rdgw-page-shell flex min-h-16 flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between md:py-0">
            <Link href="/" className="group inline-flex items-center gap-3" aria-label={`${site.name} home`}>
              {site.brand.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={site.brand.logo}
                  alt={site.name}
                  className="site-logo h-11 w-auto transition-transform duration-200 group-hover:scale-[1.015]"
                />
              ) : (
                <span className="site-wordmark transition-transform duration-200 group-hover:scale-[1.015]">
                  <span className="site-wordmark-main">{site.brand.wordmark ?? site.name}</span>
                  {site.brand.tagline && <span className="site-wordmark-tagline">{site.brand.tagline}</span>}
                </span>
              )}
            </Link>

            <nav className="flex flex-wrap items-center gap-2 text-sm">
              {site.nav.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full px-3.5 py-2 font-semibold text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
              {site.mode === "dare-tracker" ? (
                <>
                  <Link href="/dare-picker" className="rdgw-button-primary px-4 py-2 text-sm">
                    Pick a Dare
                  </Link>
                  <PlayAsControl />
                </>
              ) : (
                <a
                  href={`https://reddit.com/${site.subredditDisplay}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rdgw-button-primary px-4 py-2 text-sm"
                >
                  Reddit
                </a>
              )}
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-16 border-t border-white/10 py-8 text-center text-xs text-zinc-500">
          <div className="rdgw-page-shell space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={site.brand.mark}
              alt=""
              aria-hidden="true"
              className="site-footer-mark mx-auto h-12 w-auto opacity-90"
            />
            <p>
              {site.name} - Unofficial fan site. Content indexed from{" "}
              <a
                href={`https://reddit.com/${site.subredditDisplay}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rdgw-link"
              >
                {site.subredditDisplay}
              </a>.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
