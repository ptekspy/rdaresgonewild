import { RedditPostCard } from "@/components/RedditPostCard";
import { BOARD_PAGE_SIZE, getBoardPosts } from "@/lib/board";
import { getBoardTag, getSiteConfig } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tag } = await params;
  const boardTag = getBoardTag(tag);
  return { title: boardTag ? boardTag.label : tag };
}

export default async function TagPage({ params, searchParams }: PageProps) {
  const site = getSiteConfig();
  if (site.mode !== "reddit-board") notFound();

  const { tag } = await params;
  const boardTag = getBoardTag(tag);
  if (!boardTag) notFound();

  const query = await searchParams;
  const page = Math.max(1, parseInt(query.page ?? "1", 10));
  const posts = await getBoardPosts({ sort: "new", tagSlug: tag, page, limit: BOARD_PAGE_SIZE + 1 });
  const hasNext = posts.length > BOARD_PAGE_SIZE;
  const visiblePosts = posts.slice(0, BOARD_PAGE_SIZE);

  return (
    <div className="rdgw-page-shell py-10 space-y-8">
      <section className="space-y-5">
        <div>
          <span className="rdgw-kicker">{site.subredditDisplay}</span>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">{boardTag.label}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {site.board?.tags.map((item) => (
            <Link
              key={item.slug}
              href={`/tags/${item.slug}`}
              className={`rounded-full px-3.5 py-2 text-sm font-bold transition ${
                item.slug === boardTag.slug
                  ? "bg-pink-500 text-white"
                  : "border border-white/10 bg-white/[0.035] text-zinc-300 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visiblePosts.map((post) => (
          <RedditPostCard key={post.id} post={post} />
        ))}
      </div>

      {visiblePosts.length === 0 && <p className="rdgw-card px-4 py-12 text-center text-sm text-zinc-500">No matching posts indexed yet.</p>}

      <div className="flex justify-center gap-2">
        {page > 1 && (
          <Link href={`/tags/${boardTag.slug}?page=${page - 1}`} className="rdgw-button-secondary px-4 py-2 text-sm">
            Prev
          </Link>
        )}
        {hasNext && (
          <Link href={`/tags/${boardTag.slug}?page=${page + 1}`} className="rdgw-button-secondary px-4 py-2 text-sm">
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
