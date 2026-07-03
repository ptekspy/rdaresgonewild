import { getDb } from "@/lib/db";
import { PLAYBOOK_DARES, LEVEL_LABELS } from "@rdgw/playbook";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { HomePlayerDashboard } from "@/components/HomePlayerDashboard";
import { HeroDareChat } from "@/components/HeroDareChat";
import { RedditPostCard } from "@/components/RedditPostCard";
import { getBoardPosts, getBoardStats, getTopBoardCreators } from "@/lib/board";
import { getSiteConfig } from "@/lib/site";
import { getRedditUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

const NOT_REJECTED = { OR: [{ verified: true }, { verified: null }] };

async function getStats() {
  const db = getDb();
  const site = getSiteConfig();
  const [userCount, playbookCount, communityCount] = await Promise.all([
    db.dgwUser.count({ where: { posts: { some: { subreddit: site.subreddit } } } }),
    db.playbookCompletion.count({ where: { ...NOT_REJECTED, post: { subreddit: site.subreddit } } }),
    db.communityCompletion.count({ where: { ...NOT_REJECTED, post: { subreddit: site.subreddit } } }),
  ]);
  return { userCount, playbookCount, communityCount };
}

async function getTopCreators(limit = 8) {
  const db = getDb();
  const site = getSiteConfig();
  const rows = await db.playbookCompletion.groupBy({
    by: ["username"],
    where: { ...NOT_REJECTED, post: { subreddit: site.subreddit } },
    _count: { dareSlug: true },
    orderBy: { _count: { dareSlug: "desc" } },
    take: limit,
  });
  return rows.map((r: { username: string; _count: { dareSlug: number } }, i: number) => ({
    rank: i + 1,
    username: r.username,
    count: r._count.dareSlug,
  }));
}

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function HomePage() {
  const site = getSiteConfig();
  if (site.mode === "reddit-board") {
    return <BoardHomePage />;
  }

  const [stats, topCreators] = await Promise.all([getStats(), getTopCreators()]);
  const totalDares = PLAYBOOK_DARES.length;

  return (
    <div className="rdgw-page-shell py-4 sm:py-8">
      <section className="rdgw-card-strong rdgw-glow-border relative isolate overflow-hidden px-5 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="rdgw-hero-accent rdgw-hero-accent-one" />
        <div className="rdgw-hero-accent rdgw-hero-accent-two" />

        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative z-10 space-y-7">
            <span className="rdgw-kicker">Unofficial r/daresgonewild tracker</span>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
                Track dares. <span className="rdgw-gradient-text">Level up.</span> Get wild.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-zinc-300">
                {totalDares} official playbook dares across 13 levels. Follow progress, compare creators, and pick the next challenge waiting for you.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/dare-picker" className="rdgw-button-primary px-6 py-3 text-sm">
                Pick my next dare
              </Link>
              <Link href="/leaderboard" className="rdgw-button-secondary px-6 py-3 text-sm">
                View leaderboard
              </Link>
            </div>
          </div>

          <div className="relative z-10">
            <HeroDareChat />
          </div>
        </div>
      </section>

      <div className="mt-8">
        <HomePlayerDashboard />
      </div>

      <AdSlot slotKey="home_banner" className="mx-auto mt-8 max-w-3xl" />

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Creators tracked", value: fmtNumber(stats.userCount), icon: "👤" },
          { label: "Playbook completions", value: fmtNumber(stats.playbookCount), icon: "✅" },
          { label: "Community dares", value: fmtNumber(stats.communityCount), icon: "🔥" },
        ].map((stat) => (
          <div key={stat.label} className="rdgw-card p-5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.07] text-xl">
              {stat.icon}
            </div>
            <p className="text-3xl font-black text-white">{stat.value}</p>
            <p className="mt-1 text-sm text-zinc-400">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-14 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rdgw-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="rdgw-kicker">Leaderboard</p>
              <h2 className="mt-3 text-2xl font-black text-white">Top creators</h2>
            </div>
            <Link href="/leaderboard" className="rdgw-link text-sm font-bold">
              Full board →
            </Link>
          </div>

          <div className="mt-6 space-y-2">
            {topCreators.length === 0 && (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-zinc-500">
                No data yet — check back after the first crawl.
              </p>
            )}
            {topCreators.map((creator) => {
              const pct = Math.round((creator.count / totalDares) * 100);
              return (
                <Link
                  key={creator.username}
                  href={`/u/${creator.username}`}
                  className="group block rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:border-pink-500/40 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] font-mono text-sm text-zinc-300">
                      #{creator.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-white transition group-hover:text-pink-200">u/{creator.username}</p>
                      <div className="mt-2 rdgw-progress h-2">
                        <div className="rdgw-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-right text-sm text-zinc-400">
                      {creator.count}/{totalDares}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rdgw-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="rdgw-kicker">Playbook</p>
              <h2 className="mt-3 text-2xl font-black text-white">The 13 levels</h2>
            </div>
            <Link href="/dares" className="rdgw-link text-sm font-bold">
              Browse all →
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {Object.entries(LEVEL_LABELS).map(([key, label], index) => {
              const count = PLAYBOOK_DARES.filter((dare: { level: string }) => dare.level === key).length;
              return (
                <Link
                  key={key}
                  href={`/dares/${key}`}
                  className="group rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 transition hover:border-orange-400/40 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Level {index + 1}</p>
                      <p className="mt-1 font-bold text-zinc-100 group-hover:text-white">{label}</p>
                    </div>
                    <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-xs font-bold text-zinc-300">{count}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

type BoardPost = Awaited<ReturnType<typeof getBoardPosts>>[number];
type BoardCreator = Awaited<ReturnType<typeof getTopBoardCreators>>[number];
type BoardConfig = NonNullable<ReturnType<typeof getSiteConfig>["board"]>;

async function BoardHomePage() {
  const site = getSiteConfig();
  const board = site.board;
  if (!board) return null;

  const [stats, latestPosts, topPosts, topCreators] = await Promise.all([
    getBoardStats(),
    getBoardPosts({ sort: "new", limit: 8 }),
    getBoardPosts({ sort: "top", topWindow: "month", limit: 8 }),
    getTopBoardCreators(6),
  ]);

  const statItems = [
    { label: "Posts indexed", value: fmtNumber(stats.postCount) },
    { label: "Creators tracked", value: fmtNumber(stats.creatorCount) },
    { label: board.statsLabel ?? "Tags live", value: fmtNumber(board.tags.length) },
  ];

  return (
    <div className={`board-home board-home-${board.layout} rdgw-page-shell py-4 sm:py-8`}>
      {renderBoardHero({ site, latestPosts, topCreators })}

      <AdSlot slotKey="home_banner" className="mx-auto mt-8 max-w-3xl" />

      <section className="board-stats mt-8 grid gap-4 sm:grid-cols-3">
        {statItems.map((stat) => (
          <div key={stat.label} className="rdgw-card p-5">
            <p className="text-3xl font-black text-white">{stat.value}</p>
            <p className="mt-1 text-sm text-zinc-400">{stat.label}</p>
          </div>
        ))}
      </section>

      {renderBoardSections({ latestPosts, topPosts, topCreators })}
    </div>
  );
}

function renderBoardHero({
  site,
  latestPosts,
  topCreators,
}: {
  site: ReturnType<typeof getSiteConfig>;
  latestPosts: BoardPost[];
  topCreators: BoardCreator[];
}) {
  const board = site.board;
  if (!board) return null;

  if (board.layout === "flair-ladder") {
    return (
      <section className="rdgw-card-strong rdgw-glow-border board-hero board-hero-ladder relative isolate overflow-hidden px-5 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="rdgw-hero-accent rdgw-hero-accent-one" />
        <div className="rdgw-hero-accent rdgw-hero-accent-two" />
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <HeroCopy board={board} />
          <div className="relative z-10 space-y-3">
            {board.tags.slice(0, 6).map((tag, index) => (
              <Link
                key={tag.slug}
                href={`/tags/${tag.slug}`}
                className="board-ladder-row group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 transition hover:bg-white/[0.07]"
              >
                <span className="font-mono text-xs font-black text-zinc-500">0{index + 1}</span>
                <span className="min-w-0 flex-1 font-black text-white">{tag.label}</span>
                <span className="h-2 w-20 rounded-full bg-white/[0.08]">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${92 - index * 9}%`, background: "var(--brand-gradient)" }}
                  />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (board.layout === "creator-led" || board.layout === "catalog") {
    return (
      <section className="rdgw-card-strong rdgw-glow-border board-hero board-hero-creators relative isolate overflow-hidden px-5 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="rdgw-hero-accent rdgw-hero-accent-one" />
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_0.78fr]">
          <HeroCopy board={board} />
          <div className="relative z-10 space-y-3">
            <p className="rdgw-kicker">{board.creatorLabel ?? "Creator spotlight"}</p>
            {topCreators.slice(0, 5).map((creator, index) => (
              <Link
                key={creator.authorUsername}
                href={`/u/${creator.authorUsername}`}
                className="rdgw-list-link flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] font-mono text-sm text-zinc-300">
                  #{index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-black text-white">u/{creator.authorUsername}</span>
                <span className="text-sm text-zinc-400">{creator._count.id}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (board.layout === "challenge") {
    return (
      <section className="rdgw-card-strong rdgw-glow-border board-hero board-hero-challenge relative isolate overflow-hidden px-5 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="rdgw-hero-accent rdgw-hero-accent-two" />
        <div className="grid items-center gap-10 lg:grid-cols-[0.86fr_1.14fr]">
          <HeroCopy board={board} />
          <div className="relative z-10 grid gap-3 sm:grid-cols-2">
            {board.tags.slice(0, 6).map((tag, index) => (
              <Link key={tag.slug} href={`/tags/${tag.slug}`} className="board-challenge-tile rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 transition hover:bg-white/[0.07]">
                <span className="font-mono text-xs font-black uppercase text-zinc-500">Step {index + 1}</span>
                <span className="mt-2 block text-lg font-black text-white">{tag.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (board.layout === "scene") {
    return (
      <section className="rdgw-card-strong rdgw-glow-border board-hero board-hero-scene relative isolate overflow-hidden px-5 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="grid items-end gap-10 lg:grid-cols-[1fr_0.95fr]">
          <HeroCopy board={board} />
          <div className="relative z-10 grid gap-3">
            {board.tags.slice(0, 4).map((tag) => (
              <Link key={tag.slug} href={`/tags/${tag.slug}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.045] px-5 py-4 text-lg font-black text-white transition hover:bg-white/[0.075]">
                {tag.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (board.layout === "contrast") {
    return (
      <section className="rdgw-card-strong rdgw-glow-border board-hero board-hero-contrast relative isolate overflow-hidden px-5 py-12 text-center sm:px-10 lg:px-12 lg:py-16">
        <div className="mx-auto max-w-4xl">
          <HeroCopy board={board} centered />
        </div>
      </section>
    );
  }

  if (board.layout === "scenic") {
    return (
      <section className="rdgw-card-strong rdgw-glow-border board-hero board-hero-scenic relative isolate overflow-hidden px-5 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="relative z-10 space-y-8">
          <HeroCopy board={board} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {latestPosts.slice(0, 4).map((post) => (
              <RedditPostCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (board.layout === "editorial") {
    return (
      <section className="rdgw-card-strong rdgw-glow-border board-hero board-hero-editorial relative isolate overflow-hidden px-5 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <HeroCopy board={board} />
          <div className="relative z-10 space-y-3">
            {latestPosts.slice(0, 5).map((post) => (
              <a key={post.id} href={getRedditUrl(post.permalink)} target="_blank" rel="noopener noreferrer" className="block border-b border-white/[0.08] py-4 last:border-b-0">
                <p className="line-clamp-2 text-lg font-black text-white">{post.title}</p>
                <p className="mt-1 text-sm text-zinc-500">u/{post.authorUsername}</p>
              </a>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rdgw-card-strong rdgw-glow-border board-hero board-hero-spotlight relative isolate overflow-hidden px-5 py-10 sm:px-10 lg:px-12 lg:py-14">
      <div className="rdgw-hero-accent rdgw-hero-accent-one" />
      <div className="rdgw-hero-accent rdgw-hero-accent-two" />
      <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <HeroCopy board={board} />
        <div className="relative z-10 grid grid-cols-2 gap-3">
          {latestPosts.slice(0, 4).map((post) => (
            <RedditPostCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </section>
  );
}

function HeroCopy({ board, centered = false }: { board: BoardConfig; centered?: boolean }) {
  return (
    <div className={`relative z-10 space-y-7 ${centered ? "mx-auto flex max-w-4xl flex-col items-center" : ""}`}>
      <span className="rdgw-kicker">{board.kicker}</span>
      <div className="space-y-5">
        <h1 className={`max-w-3xl text-5xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl ${centered ? "text-center" : ""}`}>
          {board.headline} <span className="rdgw-gradient-text">{board.accent}</span>
        </h1>
        <p className={`max-w-2xl text-lg leading-8 text-zinc-300 ${centered ? "text-center" : ""}`}>{board.intro}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/new" className="rdgw-button-primary px-6 py-3 text-sm">
          {board.primaryCta}
        </Link>
        <Link href="/top/month" className="rdgw-button-secondary px-6 py-3 text-sm">
          {board.secondaryCta ?? "Top this month"}
        </Link>
      </div>
    </div>
  );
}

function renderBoardSections({
  latestPosts,
  topPosts,
  topCreators,
}: {
  latestPosts: BoardPost[];
  topPosts: BoardPost[];
  topCreators: BoardCreator[];
}) {
  const site = getSiteConfig();
  const board = site.board;
  if (!board) return null;

  if (board.layout === "flair-ladder") {
    return (
      <>
        <TopPostsSection posts={topPosts} title={board.browseLabel ?? "Top posts"} />
        <TagsSection title="Publicness filters" />
        <LatestPostsSection posts={latestPosts} />
        <CreatorsSection creators={topCreators} />
      </>
    );
  }

  if (board.layout === "creator-led" || board.layout === "catalog") {
    return (
      <>
        <CreatorsSection creators={topCreators} title={board.creatorLabel ?? "Creators"} />
        <LatestPostsSection posts={latestPosts} />
        <TopPostsSection posts={topPosts} />
        <TagsSection title={board.layout === "catalog" ? "Catalog tags" : "Scenario tags"} />
      </>
    );
  }

  if (board.layout === "challenge") {
    return (
      <>
        <TagsSection title="Challenge lanes" />
        <LatestPostsSection posts={latestPosts} title={board.browseLabel ?? "Scenario feed"} />
        <TopPostsSection posts={topPosts} />
        <CreatorsSection creators={topCreators} />
      </>
    );
  }

  if (board.layout === "scene") {
    return (
      <>
        <TopPostsSection posts={topPosts} title={board.browseLabel ?? "Scene feed"} />
        <CreatorsSection creators={topCreators} />
        <LatestPostsSection posts={latestPosts} />
        <TagsSection title="Scene tags" />
      </>
    );
  }

  if (board.layout === "contrast") {
    return (
      <>
        <LatestFeatureSection posts={latestPosts} />
        <TopPostsSection posts={topPosts} />
        <TagsSection title="Contrast filters" />
        <CreatorsSection creators={topCreators} />
      </>
    );
  }

  if (board.layout === "scenic") {
    return (
      <>
        <TagsSection title="Outdoor settings" />
        <LatestPostsSection posts={latestPosts} title={board.browseLabel ?? "Outdoor feed"} />
        <TopPostsSection posts={topPosts} title="Top outdoor posts" />
        <CreatorsSection creators={topCreators} />
      </>
    );
  }

  if (board.layout === "editorial") {
    return (
      <>
        <EditorialListSection posts={latestPosts} />
        <TagsSection title="Story shelves" />
        <TopPostsSection posts={topPosts} title="Top concepts" />
        <CreatorsSection creators={topCreators} />
      </>
    );
  }

  return (
    <>
      <LatestPostsSection posts={latestPosts} />
      <TopPostsSection posts={topPosts} />
      <CreatorsSection creators={topCreators} />
      <TagsSection title="Browse by setting" />
    </>
  );
}

function LatestPostsSection({ posts, title = "Newest posts" }: { posts: BoardPost[]; title?: string }) {
  return (
    <section className="mt-14 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="rdgw-kicker">Fresh feed</p>
          <h2 className="mt-3 text-2xl font-black text-white">{title}</h2>
        </div>
        <Link href="/new" className="rdgw-link text-sm font-bold">
          View all
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {posts.map((post) => (
          <RedditPostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}

function TopPostsSection({ posts, title = "Most active posts" }: { posts: BoardPost[]; title?: string }) {
  return (
    <section className="mt-14 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="rdgw-kicker">Top month</p>
          <h2 className="mt-3 text-2xl font-black text-white">{title}</h2>
        </div>
        <Link href="/top/month" className="rdgw-link text-sm font-bold">
          More top posts
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {posts.slice(0, 8).map((post) => (
          <RedditPostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}

function LatestFeatureSection({ posts }: { posts: BoardPost[] }) {
  const [featured, ...rest] = posts;
  if (!featured) return <LatestPostsSection posts={posts} />;

  return (
    <section className="mt-14 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <div>
        <div className="mb-5">
          <p className="rdgw-kicker">Fresh contrast</p>
          <h2 className="mt-3 text-2xl font-black text-white">Latest premise</h2>
        </div>
        <RedditPostCard post={featured} />
      </div>
      <div>
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="rdgw-kicker">New</p>
            <h2 className="mt-3 text-2xl font-black text-white">More from the feed</h2>
          </div>
          <Link href="/new" className="rdgw-link text-sm font-bold">
            View all
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {rest.slice(0, 6).map((post) => (
            <RedditPostCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </section>
  );
}

function EditorialListSection({ posts }: { posts: BoardPost[] }) {
  return (
    <section className="mt-14 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <p className="rdgw-kicker">Reader mode</p>
        <h2 className="mt-3 text-2xl font-black text-white">Latest story posts</h2>
      </div>
      <div className="rdgw-card divide-y divide-white/[0.08] overflow-hidden">
        {posts.slice(0, 8).map((post) => (
          <a key={post.id} href={getRedditUrl(post.permalink)} target="_blank" rel="noopener noreferrer" className="block p-5 transition hover:bg-white/[0.04]">
            <p className="line-clamp-2 text-lg font-black text-white">{post.title}</p>
            <p className="mt-2 text-sm text-zinc-500">
              u/{post.authorUsername} · {fmtNumber(post.score)} pts
            </p>
          </a>
        ))}
        {posts.length === 0 && <p className="p-8 text-center text-sm text-zinc-500">No posts indexed yet.</p>}
      </div>
    </section>
  );
}

function CreatorsSection({ creators, title = "Most posts" }: { creators: BoardCreator[]; title?: string }) {
  return (
    <section className="mt-14 rdgw-card p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="rdgw-kicker">Creators</p>
          <h2 className="mt-3 text-2xl font-black text-white">{title}</h2>
        </div>
        <Link href="/creators" className="rdgw-link text-sm font-bold">
          Full list
        </Link>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {creators.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-zinc-500">
            No data yet.
          </p>
        )}
        {creators.map((creator, index) => (
          <Link
            key={creator.authorUsername}
            href={`/u/${creator.authorUsername}`}
            className="rdgw-list-link flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:bg-white/[0.06]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] font-mono text-sm text-zinc-300">
              #{index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-bold text-white">u/{creator.authorUsername}</span>
            <span className="text-right text-sm text-zinc-400">{creator._count.id}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TagsSection({ title }: { title: string }) {
  const site = getSiteConfig();
  const board = site.board;
  if (!board) return null;

  return (
    <section className="mt-14 space-y-5">
      <div>
        <p className="rdgw-kicker">Tags</p>
        <h2 className="mt-3 text-2xl font-black text-white">{title}</h2>
      </div>
      <div className="board-tag-cloud flex flex-wrap gap-3">
        {board.tags.map((tag) => (
          <Link key={tag.slug} href={`/tags/${tag.slug}`} className="rdgw-button-secondary px-4 py-2 text-sm">
            {tag.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
