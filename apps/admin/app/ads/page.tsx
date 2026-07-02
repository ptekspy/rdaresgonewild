import { prisma } from "@rdgw/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ads" };

const PREDEFINED_SLOTS = [
  { slotKey: "home_banner", label: "Home Banner", description: "Full-width banner on the homepage" },
  { slotKey: "leaderboard_banner", label: "Leaderboard Banner", description: "Top of leaderboard page" },
  { slotKey: "dare_picker_sidebar", label: "Dare Picker Sidebar", description: "Below the dare picker form" },
  { slotKey: "profile_sidebar", label: "Profile Sidebar", description: "User profile page sidebar" },
];

type AdContentRow = {
  id: string;
  label: string;
  imageUrl: string | null;
  htmlSnippet: string | null;
  active: boolean;
  priority: number;
};

type AdSlotRow = {
  slotKey: string;
  label: string;
  description: string | null;
  contents: AdContentRow[];
};

async function ensureSlots() {
  for (const slot of PREDEFINED_SLOTS) {
    await prisma.adSlot.upsert({
      where: { slotKey: slot.slotKey },
      update: {},
      create: { slotKey: slot.slotKey, label: slot.label, description: slot.description },
    });
  }
}

export default async function AdsPage() {
  await ensureSlots();

  const slots: AdSlotRow[] = await prisma.adSlot.findMany({
    include: { contents: { orderBy: { priority: "desc" } } },
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Ad Slots</h1>
      <p className="text-zinc-400 text-sm">
        Manage ad content for each slot. Only one ad per slot is shown (highest priority active ad).
        For new ad placements, add content via the Prisma Studio:{" "}
        <code className="text-zinc-300 bg-zinc-800 px-1 rounded">pnpm db:studio</code>
      </p>

      <div className="space-y-4">
        {slots.map((slot) => {
          const activeAds = slot.contents.filter((c) => c.active);
          return (
            <div key={slot.slotKey} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{slot.label}</h2>
                  <p className="text-xs text-zinc-500">{slot.description}</p>
                  <code className="text-xs text-zinc-600">{slot.slotKey}</code>
                </div>
                <span className={`px-2 py-0.5 text-xs rounded border ${activeAds.length > 0 ? "border-green-700 text-green-400" : "border-zinc-700 text-zinc-500"}`}>
                  {activeAds.length > 0 ? `${activeAds.length} active` : "empty"}
                </span>
              </div>

              {slot.contents.length > 0 && (
                <div className="space-y-2">
                  {slot.contents.map((c) => (
                    <div key={c.id} className={`flex items-center gap-3 text-sm px-3 py-2 rounded border ${c.active ? "border-green-900 bg-green-950/20" : "border-zinc-800"}`}>
                      <span className={`w-2 h-2 rounded-full ${c.active ? "bg-green-500" : "bg-zinc-600"}`} />
                      <span className="flex-1 text-zinc-300">{c.label}</span>
                      <span className="text-zinc-600 text-xs">priority {c.priority}</span>
                      {c.imageUrl && <span className="text-zinc-600 text-xs">image</span>}
                      {c.htmlSnippet && <span className="text-zinc-600 text-xs">html</span>}
                    </div>
                  ))}
                </div>
              )}

              {slot.contents.length === 0 && (
                <p className="text-xs text-zinc-600">No content yet. Use Prisma Studio to add AdContent records.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
