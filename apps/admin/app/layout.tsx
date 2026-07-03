import "./globals.css";
import Link from "next/link";

export const metadata = { title: { default: "Paid Politely Admin", template: "%s | Admin" } };

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/posts", label: "Posts" },
  { href: "/users", label: "Users" },
  { href: "/subreddits", label: "Subreddits" },
  { href: "/ads", label: "Ads" },
  { href: "/crawler", label: "Crawler" },
  { href: "/dares", label: "Dares" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 lg:flex">
        <aside className="border-b border-zinc-800 bg-zinc-950 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-56 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
          <div className="px-4 py-4 border-b border-zinc-800">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Paid Politely</p>
            <p className="mt-1 text-sm font-semibold text-white">Admin</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto p-2 lg:block lg:flex-1 lg:space-y-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="block whitespace-nowrap rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white lg:px-4"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </body>
    </html>
  );
}
