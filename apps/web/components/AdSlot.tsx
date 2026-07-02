import { getDb } from "@/lib/db";

interface Props {
  slotKey: string;
  className?: string;
}

/**
 * Server component that fetches and renders an ad slot.
 * Returns null if no active ad content exists for this slot.
 */
export async function AdSlot({ slotKey, className = "" }: Props) {
  const db = getDb();
  const now = new Date();

  const content = await db.adContent.findFirst({
    where: {
      slotKey,
      active: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: { priority: "desc" },
  }).catch(() => null);

  if (!content) return null;

  // HTML snippet (admin-provided trusted content)
  if (content.htmlSnippet) {
    return (
      <div
        className={`ad-slot ${className}`}
        dangerouslySetInnerHTML={{ __html: content.htmlSnippet }}
      />
    );
  }

  // Image + link ad
  if (content.imageUrl) {
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={content.imageUrl}
        alt={content.altText ?? "Advertisement"}
        className="w-full rounded-lg"
        loading="lazy"
      />
    );
    return (
      <div className={`ad-slot ${className}`}>
        {content.linkUrl ? (
          <a href={content.linkUrl} target="_blank" rel="noopener noreferrer sponsored">
            {img}
          </a>
        ) : img}
        <p className="text-xs text-zinc-700 mt-1 text-right">Ad</p>
      </div>
    );
  }

  return null;
}
