import { getPostImage, getPostTagSlugs } from "@/lib/site";
import { getRedditUrl } from "@/lib/urls";
import Link from "next/link";

type BoardPost = {
  id: string;
  title: string;
  authorUsername: string;
  flair: string | null;
  score: number;
  commentCount: number;
  imageUrls: string[];
  thumbnailUrl: string | null;
  permalink: string;
  createdAtReddit: Date;
};

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

export function RedditPostCard({ post }: { post: BoardPost }) {
  const imageUrl = getPostImage(post);
  const tagSlugs = getPostTagSlugs(post).slice(0, 3);

  return (
    <article className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] transition hover:-translate-y-0.5 hover:border-pink-500/40 hover:bg-white/[0.055]">
      <a href={getRedditUrl(post.permalink)} target="_blank" rel="noopener noreferrer" className="block">
        <div className="aspect-[4/5] bg-zinc-950">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm font-bold text-zinc-600">
              Reddit media
            </div>
          )}
        </div>
      </a>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
          <Link href={`/u/${post.authorUsername}`} className="truncate font-bold text-zinc-300 hover:text-white">
            u/{post.authorUsername}
          </Link>
          <span className="shrink-0">{fmtDate(post.createdAtReddit)}</span>
        </div>

        <a href={getRedditUrl(post.permalink)} target="_blank" rel="noopener noreferrer">
          <h2 className="line-clamp-2 min-h-[3rem] text-sm font-black leading-6 text-white">{post.title}</h2>
        </a>

        <div className="flex flex-wrap gap-2">
          {post.flair && (
            <span className="rounded-full bg-pink-500/[0.14] px-2.5 py-1 text-[11px] font-bold text-pink-100">
              {post.flair}
            </span>
          )}
          {tagSlugs.map((slug) => (
            <Link
              key={slug}
              href={`/tags/${slug}`}
              className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-zinc-300 hover:bg-white/[0.1] hover:text-white"
            >
              #{slug}
            </Link>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.08] pt-3 font-mono text-xs text-zinc-500">
          <span>{fmtNumber(post.score)} pts</span>
          <span>{fmtNumber(post.commentCount)} comments</span>
        </div>
      </div>
    </article>
  );
}
