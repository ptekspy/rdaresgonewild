import { prisma } from "@rdgw/database";
import { LEVEL_LABELS, PLAYBOOK_BY_SLUG, PLAYBOOK_DARES } from "@rdgw/playbook";
import { formatDateTime } from "../admin-format";
import { reclassifyDare, verifyDare } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dares" };

type CompletionType = "playbook" | "community";

const redditPostUrl = (permalink: string) => {
  if (permalink.startsWith("http://") || permalink.startsWith("https://")) return permalink;
  return `https://reddit.com${permalink}`;
};

function DareSelector({ defaultSlug }: { defaultSlug: string }) {
  const levelGroups = PLAYBOOK_DARES.reduce<Array<{ level: (typeof PLAYBOOK_DARES)[number]["level"]; dares: typeof PLAYBOOK_DARES }>>(
    (groups, dare) => {
      const current = groups.at(-1);
      if (current?.level === dare.level) {
        current.dares.push(dare);
      } else {
        groups.push({ level: dare.level, dares: [dare] });
      }
      return groups;
    },
    [],
  );

  return (
    <select className="field min-w-56" name="dareSlug" defaultValue={defaultSlug}>
      {levelGroups.map((group) => (
        <optgroup key={group.level} label={LEVEL_LABELS[group.level]}>
          {group.dares.map((dare) => (
            <option key={dare.slug} value={dare.slug}>
              {dare.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function ReviewControls({
  id,
  type,
  defaultDareSlug,
  defaultDarerUsername,
}: {
  id: string;
  type: CompletionType;
  defaultDareSlug: string;
  defaultDarerUsername?: string;
}) {
  return (
    <div className="space-y-2">
      <form action={reclassifyDare.bind(null, id, type)} className="grid gap-2 xl:grid-cols-[150px_minmax(220px,1fr)_180px_auto]">
        <select className="field" name="targetType" defaultValue={type}>
          <option value="playbook">Playbook</option>
          <option value="community">Community</option>
        </select>
        <DareSelector defaultSlug={defaultDareSlug} />
        <input
          className="field"
          name="darerUsername"
          defaultValue={defaultDarerUsername ?? ""}
          placeholder="Dared by"
        />
        <button className="button-secondary" type="submit">Save</button>
      </form>
      <div className="flex flex-wrap gap-2">
        <form action={verifyDare.bind(null, id, type, true)}>
          <button className="rounded-md bg-green-950 px-3 py-2 text-xs font-semibold text-green-300 transition-colors hover:bg-green-900" type="submit">
            Verify
          </button>
        </form>
        <form action={verifyDare.bind(null, id, type, false)}>
          <button className="rounded-md bg-red-950 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-900" type="submit">
            Reject
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function DaresPage() {
  const [pendingPlaybook, pendingCommunity] = await Promise.all([
    prisma.playbookCompletion.findMany({
      where: { verified: null },
      orderBy: { detectedAt: "desc" },
      take: 50,
      select: {
        id: true,
        username: true,
        dareSlug: true,
        confidence: true,
        detectedAt: true,
        post: {
          select: {
            title: true,
            subreddit: true,
            permalink: true,
            redditId: true,
          },
        },
      },
    }),
    prisma.communityCompletion.findMany({
      where: { verified: null },
      orderBy: { detectedAt: "desc" },
      take: 50,
      select: {
        id: true,
        username: true,
        darerUsername: true,
        detectedAt: true,
        post: {
          select: {
            title: true,
            subreddit: true,
            permalink: true,
            redditId: true,
          },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dares Review</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Review pending dare detections, open the source Reddit post, and correct the classification before verifying.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending playbook dares ({pendingPlaybook.length})</h2>
        <div className="admin-card overflow-x-auto">
          <table className="admin-table min-w-[1080px]">
            <thead>
              <tr>
                <th>Source dare</th>
                <th>Creator</th>
                <th>Detected as</th>
                <th>Detected</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {pendingPlaybook.map((completion) => {
                const dare = PLAYBOOK_BY_SLUG.get(completion.dareSlug);
                return (
                  <tr key={completion.id}>
                    <td className="max-w-[380px]">
                      <a className="font-medium text-zinc-100 hover:text-white" href={redditPostUrl(completion.post.permalink)} target="_blank" rel="noreferrer">
                        {completion.post.title}
                      </a>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span>r/{completion.post.subreddit}</span>
                        <span>{completion.post.redditId}</span>
                      </div>
                    </td>
                    <td>
                      <a className="text-zinc-300 hover:text-white" href={`https://reddit.com/user/${completion.username}`} target="_blank" rel="noreferrer">
                        u/{completion.username}
                      </a>
                    </td>
                    <td>
                      <div>{dare ? `${dare.emoji} ${dare.name}` : completion.dareSlug}</div>
                      <div className="mt-1 text-xs text-zinc-500">{Math.round(completion.confidence * 100)}% confidence</div>
                    </td>
                    <td className="text-xs text-zinc-500">{formatDateTime(completion.detectedAt)}</td>
                    <td>
                      <ReviewControls id={completion.id} type="playbook" defaultDareSlug={completion.dareSlug} />
                    </td>
                  </tr>
                );
              })}
              {pendingPlaybook.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-zinc-600">No pending playbook dares.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending community dares ({pendingCommunity.length})</h2>
        <div className="admin-card overflow-x-auto">
          <table className="admin-table min-w-[1080px]">
            <thead>
              <tr>
                <th>Source dare</th>
                <th>Creator</th>
                <th>Dared by</th>
                <th>Detected</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {pendingCommunity.map((completion) => (
                <tr key={completion.id}>
                  <td className="max-w-[380px]">
                    <a className="font-medium text-zinc-100 hover:text-white" href={redditPostUrl(completion.post.permalink)} target="_blank" rel="noreferrer">
                      {completion.post.title}
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span>r/{completion.post.subreddit}</span>
                      <span>{completion.post.redditId}</span>
                    </div>
                  </td>
                  <td>
                    <a className="text-zinc-300 hover:text-white" href={`https://reddit.com/user/${completion.username}`} target="_blank" rel="noreferrer">
                      u/{completion.username}
                    </a>
                  </td>
                  <td>u/{completion.darerUsername}</td>
                  <td className="text-xs text-zinc-500">{formatDateTime(completion.detectedAt)}</td>
                  <td>
                    <ReviewControls
                      id={completion.id}
                      type="community"
                      defaultDareSlug={PLAYBOOK_DARES[0]?.slug ?? ""}
                      defaultDarerUsername={completion.darerUsername}
                    />
                  </td>
                </tr>
              ))}
              {pendingCommunity.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-zinc-600">No pending community dares.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
