import type { Metadata } from "next";
import Link from "next/link";
import { PlayAsControl } from "@/components/PlayAsControl";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DaresGoneWild — Dare Leaderboard & Picker", template: "%s | DaresGoneWild" },
  description: "Track your r/daresgonewild playbook progress, climb the leaderboard, and get your next dare.",
  metadataBase: new URL("https://rdaresgonewild.com"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
            <Link href="/" className="text-lg font-bold text-red-500 tracking-tight">
              DaresGoneWild
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/leaderboard" className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                Leaderboard
              </Link>
              <Link href="/dare-picker" className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors">
                Pick a Dare
              </Link>
              <PlayAsControl />
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-600">
          <p>
            DaresGoneWild.com — Unofficial fan site. All dare content from{" "}
            <a href="https://reddit.com/r/daresgonewild" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:text-red-400">
              r/daresgonewild
            </a>.
          </p>
        </footer>
      </body>
    </html>
  );
}
