import { prisma, Prisma } from "@rdgw/database";
import Link from "next/link";
import { formatDateTime, formatNumber } from "../admin-format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Posts" };

interface PageProps {
  searchParams: Promise<{ page?: string; q?: string; subreddit?: string; source?: string }>;
}

const PAGE_SIZE = 75;

function pageHref(baseParams: URLSearchParams, page: number) {
  const params = new URLSearchParams(baseParams);
  params.set("page", String(page));
  return `/posts?${params.toString()}`;
}

export default async function PostsPage({ searchParams }: PageProps) {
  const { page: pageStr, q: rawQuery, subreddit: rawSubreddit, source: rawSource } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const query = rawQuery?.trim() ?? "";
  const subreddit = rawSubreddit?.trim() ?? "";
  const source = rawSource?.trim() ?? "";

  const where: Prisma.DgwPostWhereInput = {};
  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { selftext: { contains: query, mode: "insensitive" } },
      { authorUsername: { contains: query, mode: "insensitive" } },
      { redditId: { contains: query, mode: "insensitive" } },
    ];
  }
  if (subreddit) {
    where.subreddit = { equals: subreddit, mode: "insensitive" };
  }
  if (source) {
    where.source = source;
  }

  const [posts, total, subredditOptions, sourceOptions] = await Promise.all([
    prisma.dgwPost.findMany({
      where,
      orderBy: { createdAtReddit: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        redditId: true,
        subreddit: true,
        authorUsername: true,
        title: true,
        flair: true,
        score: true,
        commentCount: true,
        mediaUrls: true,
        imageUrls: true,
        outboundUrl: true,
        permalink: true,
        source: true,
        createdAtReddit: true,
        lastSeenAt: true,
      },
    }),
    prisma.dgwPost.count({ where }),
    prisma.dgwPost.groupBy({ by: ["subreddit"], _count: { _all: true }, orderBy: { subreddit: "asc" } }),
    prisma.dgwPost.groupBy({ by: ["source"], _count: { _all: true }, orderBy: { source: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseParams = new URLSearchParams();
  if (query) baseParams.set("q", query);
  if (subreddit) baseParams.set("subreddit", subreddit);
  if (source) baseParams.set("source", source);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Posts</h1>
          <p className="mt-1 text-sm text-zinc-400">{formatNumber(total)} posts in this view.</p>
        </div>
        <Link href="/crawler" className="button-secondary">Run crawler</Link>
      </div>

      <form className="admin-card grid gap-3 p-4 lg:grid-cols-[1fr_220px_180px_auto]" action="/posts">
        <input className="field" name="q" defaultValue={query} placeholder="Search title, author, text, Reddit ID" />
        <select className="field" name="subreddit" defaultValue={subreddit}>
          <option value="">All subreddits</option>
          {subredditOptions.map((option) => (
            <option key={option.subreddit} value={option.subreddit}>
              r/{option.subreddit} ({formatNumber(option._count._all)})
            </option>
          ))}
        </select>
        <select className="field" name="source" defaultValue={source}>
          <option value="">All sources</option>
          {sourceOptions.map((option) => (
            <option key={option.source} value={option.source}>
              {option.source} ({formatNumber(option._count._all)})
            </option>
          ))}
        </select>
        <button className="button-primary" type="submit">Filter</button>
      </form>

      <div className="admin-card overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Post</th>
              <th>Subreddit</th>
              <th>Author</th>
              <th>Score</th>
              <th>Comments</th>
              <th>Media</th>
              <th>Source</th>
              <th>Posted</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const mediaCount = post.mediaUrls.length + post.imageUrls.length + (post.outboundUrl ? 1 : 0);
              return (
                <tr key={post.id}>
                  <td className="max-w-[420px]">
                    <a className="font-medium text-zinc-100 hover:text-white" href={`https://reddit.com${post.permalink}`} target="_blank" rel="noreferrer">
                      {post.title}
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span>{post.redditId}</span>
                      {post.flair && <span className="badge badge-zinc">{post.flair}</span>}
                    </div>
                  </td>
                  <td>r/{post.subreddit}</td>
                  <td>
                    <a className="text-zinc-300 hover:text-white" href={`https://reddit.com/user/${post.authorUsername}`} target="_blank" rel="noreferrer">
                      u/{post.authorUsername}
                    </a>
                  </td>
                  <td>{formatNumber(post.score)}</td>
                  <td>{formatNumber(post.commentCount)}</td>
                  <td>{formatNumber(mediaCount)}</td>
                  <td><span className="badge badge-zinc">{post.source}</span></td>
                  <td className="text-xs text-zinc-500">
                    <div>{formatDateTime(post.createdAtReddit)}</div>
                    <div>seen {formatDateTime(post.lastSeenAt)}</div>
                  </td>
                </tr>
              );
            })}
            {posts.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-zinc-600">No posts match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-zinc-400">
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="button-secondary" href={pageHref(baseParams, page - 1)}>Previous</Link>}
          {page < totalPages && <Link className="button-secondary" href={pageHref(baseParams, page + 1)}>Next</Link>}
        </div>
      </div>
    </div>
  );
}
