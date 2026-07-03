import { prisma } from "@rdgw/database";
import { formatDateTime, formatNumber, statusClass } from "../admin-format";
import { saveSiteSubreddit, toggleSiteSubreddit } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subreddits" };

export default async function SubredditsPage() {
  const [subredditStats, mappings, sites] = await Promise.all([
    prisma.dgwPost.groupBy({
      by: ["subreddit"],
      _count: { _all: true },
      _sum: { score: true, commentCount: true },
      _max: { createdAtReddit: true, lastSeenAt: true },
      orderBy: { subreddit: "asc" },
    }),
    prisma.siteSubreddit.findMany({
      orderBy: [{ siteKey: "asc" }, { subreddit: "asc" }],
    }),
    prisma.site.findMany({
      orderBy: { key: "asc" },
      include: {
        placements: {
          orderBy: { key: "asc" },
          include: {
            _count: { select: { bookings: true } },
          },
        },
        _count: {
          select: { impressions: true, clicks: true },
        },
      },
    }),
  ]);

  const siteByKey = new Map(sites.map((site) => [site.key, site]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Subreddits</h1>
        <p className="mt-1 text-sm text-zinc-400">Source coverage, site mappings, and placement setup for the network.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Source coverage</h2>
        <div className="admin-card overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Subreddit</th>
                <th>Posts</th>
                <th>Score total</th>
                <th>Comments</th>
                <th>Newest post</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {subredditStats.map((row) => (
                <tr key={row.subreddit}>
                  <td className="font-medium">r/{row.subreddit}</td>
                  <td>{formatNumber(row._count._all)}</td>
                  <td>{formatNumber(row._sum.score)}</td>
                  <td>{formatNumber(row._sum.commentCount)}</td>
                  <td className="text-xs text-zinc-500">{formatDateTime(row._max.createdAtReddit)}</td>
                  <td className="text-xs text-zinc-500">{formatDateTime(row._max.lastSeenAt)}</td>
                </tr>
              ))}
              {subredditStats.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-zinc-600">No crawled subreddit data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Site mappings</h2>
          <div className="admin-card overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Domain</th>
                  <th>Subreddit</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => {
                  const site = siteByKey.get(mapping.siteKey);
                  return (
                    <tr key={mapping.id}>
                      <td>
                        <div className="font-medium">{site?.name ?? mapping.siteKey}</div>
                        <div className="font-mono text-xs text-zinc-500">{mapping.siteKey}</div>
                      </td>
                      <td className="text-zinc-400">{site?.domain ?? "none"}</td>
                      <td>r/{mapping.subreddit}</td>
                      <td><span className={mapping.enabled ? "badge badge-green" : "badge badge-zinc"}>{mapping.enabled ? "enabled" : "disabled"}</span></td>
                      <td>
                        <form action={toggleSiteSubreddit.bind(null, mapping.id, !mapping.enabled)}>
                          <button className="button-secondary" type="submit">{mapping.enabled ? "Disable" : "Enable"}</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {mappings.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-zinc-600">No site mappings yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <form action={saveSiteSubreddit} className="admin-card space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold">Add mapping</h2>
            <p className="mt-1 text-sm text-zinc-500">Connect a public site key to one source subreddit feed.</p>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Site key</span>
            <input className="field" name="siteKey" placeholder="rdaresgonewild" required />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Site name</span>
            <input className="field" name="siteName" placeholder="r/daresgonewild Tracker" required />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Domain</span>
            <input className="field" name="domain" placeholder="rdaresgonewild.com" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Subreddit</span>
            <input className="field" name="subreddit" placeholder="daresgonewild" required />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input name="enabled" type="checkbox" defaultChecked />
            Enabled
          </label>
          <button className="button-primary w-full" type="submit">Save mapping</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sites and placements</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {sites.map((site) => (
            <div className="admin-card p-5" key={site.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{site.name}</h3>
                  <p className="mt-1 font-mono text-xs text-zinc-500">{site.key}</p>
                  <p className="mt-1 text-sm text-zinc-400">{site.domain ?? "No domain set"}</p>
                </div>
                <span className={statusClass(site.status)}>{site.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xl font-semibold">{formatNumber(site._count.impressions)}</p>
                  <p className="text-xs text-zinc-500">impressions</p>
                </div>
                <div>
                  <p className="text-xl font-semibold">{formatNumber(site._count.clicks)}</p>
                  <p className="text-xs text-zinc-500">clicks</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {site.placements.map((placement) => (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 px-3 py-2 text-sm" key={placement.id}>
                    <div>
                      <span className="font-medium">{placement.label}</span>
                      <span className="ml-2 font-mono text-xs text-zinc-500">{placement.key}</span>
                    </div>
                    <div className="text-right text-xs text-zinc-500">
                      <div>{placement.width ?? "auto"}x{placement.height ?? "auto"}</div>
                      <div>{formatNumber(placement._count.bookings)} bookings</div>
                    </div>
                  </div>
                ))}
                {site.placements.length === 0 && (
                  <p className="text-sm text-zinc-600">No placements configured.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
