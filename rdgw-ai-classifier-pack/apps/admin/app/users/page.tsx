import { prisma, Prisma } from "@rdgw/database";
import Link from "next/link";
import { formatDateTime, formatNumber, statusClass } from "../admin-format";
import { ClassifyModelButton } from "./ClassifyModelButton";
import { ScanUserProfileButton } from "./ScanUserProfileButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

interface PageProps {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}

const PAGE_SIZE = 100;

type UserRow = {
  id: string;
  username: string;
  syncStatus: string;
  lastSyncedAt: Date | null;
  postCount: number;
  classification: {
    status: string;
    primaryType: string | null;
    categories: string[];
    confidence: number | null;
    completedAt: Date | null;
    error: string | null;
  } | null;
  _count: {
    posts: number;
    playbookCompletions: number;
    communityCompletions: number;
  };
};

function classificationStatusClass(status: string | null | undefined) {
  switch (status) {
    case "COMPLETE":
      return "rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-300";
    case "QUEUED":
    case "RUNNING":
      return "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300";
    case "FAILED":
      return "rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300";
    default:
      return "rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400";
  }
}

function formatConfidence(confidence: number | null | undefined) {
  if (typeof confidence !== "number") return "";
  return ` ${(confidence * 100).toFixed(0)}%`;
}

export default async function UsersPage({ searchParams }: PageProps) {
  const { page: pageStr, q: rawQuery, status: rawStatus } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const query = rawQuery?.trim() ?? "";
  const status = rawStatus?.trim() ?? "";

  const where: Prisma.DgwUserWhereInput = {};
  if (query) {
    where.username = { contains: query, mode: "insensitive" };
  }
  if (status) {
    where.syncStatus = status;
  }

  const [users, total] = await Promise.all([
    prisma.dgwUser.findMany({
      where,
      orderBy: { lastSyncedAt: { sort: "desc", nulls: "last" } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        classification: {
          select: {
            status: true,
            primaryType: true,
            categories: true,
            confidence: true,
            completedAt: true,
            error: true,
          },
        },
        _count: {
          select: { posts: true, playbookCompletions: true, communityCompletions: true },
        },
      },
    }),
    prisma.dgwUser.count({ where }),
  ]);

  const typedUsers = users as UserRow[];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseParams = new URLSearchParams();
  if (query) baseParams.set("q", query);
  if (status) baseParams.set("status", status);

  function pageHref(nextPage: number) {
    const params = new URLSearchParams(baseParams);
    params.set("page", String(nextPage));
    return `/users?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="mt-1 text-sm text-zinc-400">{formatNumber(total)} creators and crawled Reddit users.</p>
        </div>
        <Link href="/crawler" className="button-secondary">Sync user</Link>
      </div>

      <form className="admin-card grid gap-3 p-4 sm:grid-cols-[1fr_180px_auto]" action="/users">
        <input className="field" name="q" defaultValue={query} placeholder="Search username" />
        <select className="field" name="status" defaultValue={status}>
          <option value="">Any sync status</option>
          <option value="never">never</option>
          <option value="syncing">syncing</option>
          <option value="fresh">fresh</option>
          <option value="stale">stale</option>
        </select>
        <button className="button-primary" type="submit">Filter</button>
      </form>

      <div className="admin-card overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Sync status</th>
              <th>Posts</th>
              <th>Playbook</th>
              <th>Community</th>
              <th>AI type</th>
              <th>AI status</th>
              <th>Last synced</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {typedUsers.map((u) => (
              <tr key={u.id}>
                <td>
                  <a className="font-medium hover:text-white" href={`https://reddit.com/user/${u.username}`} target="_blank" rel="noreferrer">u/{u.username}</a>
                </td>
                <td><span className={statusClass(u.syncStatus)}>{u.syncStatus}</span></td>
                <td>{formatNumber(u._count.posts || u.postCount)}</td>
                <td>{formatNumber(u._count.playbookCompletions)}</td>
                <td>{formatNumber(u._count.communityCompletions)}</td>
                <td className="max-w-48 text-xs text-zinc-300" title={u.classification?.categories?.join(", ") ?? undefined}>
                  {u.classification?.primaryType ?? "—"}
                  {formatConfidence(u.classification?.confidence)}
                </td>
                <td>
                  <span className={classificationStatusClass(u.classification?.status)} title={u.classification?.error ?? undefined}>
                    {u.classification?.status ?? "NEVER"}
                  </span>
                </td>
                <td className="text-xs text-zinc-500">{formatDateTime(u.lastSyncedAt)}</td>
                <td>
                  <div className="flex gap-2">
                    <ScanUserProfileButton username={u.username} syncStatus={u.syncStatus} />
                    <ClassifyModelButton username={u.username} status={u.classification?.status} />
                  </div>
                </td>
              </tr>
            ))}
            {typedUsers.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-zinc-600">No users match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-zinc-400">
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="button-secondary" href={pageHref(page - 1)}>Previous</Link>}
          {page < totalPages && <Link className="button-secondary" href={pageHref(page + 1)}>Next</Link>}
        </div>
      </div>
    </div>
  );
}
