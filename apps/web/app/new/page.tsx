import { RedditPostCard } from "@/components/RedditPostCard";
import { getBoardPosts, BOARD_PAGE_SIZE } from "@/lib/board";
import { getSiteConfig } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "New Posts" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function NewPostsPage({ searchParams }: PageProps) {
  const site = getSiteConfig();
  if (site.mode !== "reddit-board") notFound();

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const posts = await getBoardPosts({ sort: "new", page, limit: BOARD_PAGE_SIZE + 1 });
  const hasNext = posts.length > BOARD_PAGE_SIZE;
  const visiblePosts = posts.slice(0, BOARD_PAGE_SIZE);

  return (
    <div className="rdgw-page-shell py-10 space-y-8">
      <section className="space-y-4">
        <span className="rdgw-kicker">{site.subredditDisplay}</span>
        <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">New posts</h1>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visiblePosts.map((post) => (
          <RedditPostCard key={post.id} post={post} />
        ))}
      </div>

      {visiblePosts.length === 0 && <p className="rdgw-card px-4 py-12 text-center text-sm text-zinc-500">No posts indexed yet.</p>}

      <div className="flex justify-center gap-2">
        {page > 1 && (
          <Link href={`/new?page=${page - 1}`} className="rdgw-button-secondary px-4 py-2 text-sm">
            Prev
          </Link>
        )}
        {hasNext && (
          <Link href={`/new?page=${page + 1}`} className="rdgw-button-secondary px-4 py-2 text-sm">
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
