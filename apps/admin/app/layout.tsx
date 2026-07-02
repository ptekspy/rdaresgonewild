import "./globals.css";
import Link from "next/link";

export const metadata = { title: { default: "Admin — DGW", template: "%s | Admin" } };

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/crawler", label: "Crawler" },
  { href: "/completions", label: "Completions" },
  { href: "/ads", label: "Ads" },
  { href: "/users", label: "Users" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen">
        <aside className="w-48 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col">
          <div className="px-4 py-4 border-b border-zinc-800">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">DGW Admin</p>
          </div>
          <nav className="flex-1 py-2">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="block px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="flex-1 p-8">{children}</main>
      </body>
    </html>
  );
}
