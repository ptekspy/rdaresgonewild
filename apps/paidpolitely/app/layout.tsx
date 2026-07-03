import type { Metadata, Viewport } from "next";
import "./globals.css";
import { siteConfig } from "@/lib/site";

const title = "PaidPolitely — Direct display ads for adult Reddit communities";
const description =
  "PaidPolitely sells direct display ads across niche NSFW Reddit-adjacent community sites and helps subreddits launch companion sites.";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title,
  description,
  applicationName: "PaidPolitely",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title,
    description,
    url: siteConfig.siteUrl,
    siteName: "PaidPolitely",
    images: [
      {
        url: "/og/paidpolitely-og.png",
        width: 1200,
        height: 630,
        alt: "PaidPolitely display ads and subreddit companion sites",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og/paidpolitely-og.png"],
  },
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0710",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
