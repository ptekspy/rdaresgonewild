import { RedditPostCard } from "@/components/RedditPostCard";
import { BOARD_PAGE_SIZE, getBoardPosts, type TopWindow } from "@/lib/board";
import { getSiteConfig } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const WINDOWS: TopWindow[] = ["day", "week", "month", "year", "all"];

interface PageProps {
  params: Promise<{ window: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { window } = await params;
  return { title: `Top ${window}` };
}

export default async function TopPostsPage({ params, searchParams }: PageProps) {
  const site = getSiteConfig();
  if (site.mode !== "reddit-board") notFound();

  const { window } = await params;
  if (!WINDOWS.includes(window as TopWindow)) notFound();

  const query = await searchParams;
  const page = Math.max(1, parseInt(query.page ?? "1", 10));
  const topWindow = window as TopWindow;
  const posts = await getBoardPosts({ sort: "top", topWindow, page, limit: BOARD_PAGE_SIZE + 1 });
  const hasNext = posts.length > BOARD_PAGE_SIZE;
  const visiblePosts = posts.slice(0, BOARD_PAGE_SIZE);

  return (
    <div className="rdgw-page-shell py-10 space-y-8">
      <section className="space-y-5">
        <div>
          <span className="rdgw-kicker">{site.subredditDisplay}</span>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">Top {topWindow}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {WINDOWS.map((item) => (
            <Link
              key={item}
              href={`/top/${item}`}
              className={`rounded-full px-3.5 py-2 text-sm font-bold transition ${
                item === topWindow
                  ? "bg-pink-500 text-white"
                  : "border border-white/10 bg-white/[0.035] text-zinc-300 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              {item}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visiblePosts.map((post) => (
          <RedditPostCard key={post.id} post={post} />
        ))}
      </div>

      {visiblePosts.length === 0 && <p className="rdgw-card px-4 py-12 text-center text-sm text-zinc-500">No posts indexed yet.</p>}

      <div className="flex justify-center gap-2">
        {page > 1 && (
          <Link href={`/top/${topWindow}?page=${page - 1}`} className="rdgw-button-secondary px-4 py-2 text-sm">
            Prev
          </Link>
        )}
        {hasNext && (
          <Link href={`/top/${topWindow}?page=${page + 1}`} className="rdgw-button-secondary px-4 py-2 text-sm">
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
