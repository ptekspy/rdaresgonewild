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
    icon: [
      { url: "/brand/favicon.ico" },
      { url: "/brand/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  openGraph: {
    title: site.name,
    description: site.description,
    siteName: site.name,
    images: [{ url: "/brand/social-avatar-1024x1024.png", width: 1024, height: 1024, alt: site.name }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const site = getSiteConfig();

  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-title" content={site.shortName} />
      </head>
      <body className="min-h-screen flex flex-col antialiased">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute left-[-12rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-pink-600/20 blur-3xl" />
          <div className="absolute right-[-14rem] top-[-8rem] h-[36rem] w-[36rem] rounded-full bg-orange-500/[0.14] blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-pink-500/60 to-transparent" />
        </div>

        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090b16]/[0.82] backdrop-blur-xl">
          <div className="rdgw-page-shell flex min-h-16 flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between md:py-0">
            <Link href="/" className="group inline-flex items-center gap-3" aria-label={`${site.name} home`}>
              {site.mode === "dare-tracker" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/brand/rdgw-logo-horizontal-color-white.png"
                  alt={site.name}
                  className="h-11 w-auto transition-transform duration-200 group-hover:scale-[1.015]"
                />
              ) : (
                <span className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2 text-lg font-black text-white transition group-hover:border-pink-500/40">
                  {site.name}
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
              src="/brand/rdgw-flame-icon-color.png"
              alt=""
              aria-hidden="true"
              className="mx-auto h-12 w-auto opacity-90"
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
