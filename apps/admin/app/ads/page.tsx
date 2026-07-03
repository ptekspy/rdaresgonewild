import {
  AdultAdCategory,
  CampaignStatus,
  CreativeStatus,
  PricingModel,
  prisma,
} from "@rdgw/database";
import { formatDateTime, formatNumber, formatPercent, statusClass } from "../admin-format";
import { approveCreative, createAdPackage, toggleBooking } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ads" };

function isCurrentBooking(booking: {
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  campaign: { status: string };
  creative: { status: string };
}) {
  const now = new Date();
  const hasStarted = !booking.startsAt || booking.startsAt <= now;
  const hasNotEnded = !booking.endsAt || booking.endsAt >= now;
  return booking.enabled && hasStarted && hasNotEnded && booking.campaign.status === "ACTIVE" && booking.creative.status === "APPROVED";
}

export default async function AdsPage() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [bookings, advertisers, placements, pendingCreatives, totals] = await Promise.all([
    prisma.booking.findMany({
      orderBy: [{ enabled: "desc" }, { priority: "desc" }, { createdAt: "desc" }],
      take: 150,
      include: {
        campaign: { include: { advertiser: true } },
        creative: true,
        placement: { include: { site: true } },
        _count: { select: { impressions: true, clicks: true } },
      },
    }),
    prisma.advertiser.findMany({
      orderBy: { updatedAt: "desc" },
      take: 60,
      include: {
        campaigns: {
          orderBy: { updatedAt: "desc" },
          take: 3,
          include: { _count: { select: { creatives: true, bookings: true } } },
        },
      },
    }),
    prisma.placement.findMany({
      orderBy: [{ site: { key: "asc" } }, { key: "asc" }],
      include: { site: true },
    }),
    prisma.creative.findMany({
      where: { status: { in: [CreativeStatus.DRAFT, CreativeStatus.PENDING_REVIEW] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { campaign: { include: { advertiser: true } } },
    }),
    Promise.all([
      prisma.adImpression.count(),
      prisma.adClick.count(),
      prisma.adImpression.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.adClick.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.booking.count(),
    ]),
  ]);

  const [impressions, clicks, weekImpressions, weekClicks, bookingCount] = totals;
  const currentBookings = bookings.filter(isCurrentBooking);
  const bookedPlacementIds = new Set(bookings.filter((booking) => booking.enabled).map((booking) => booking.placementId));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ads</h1>
          <p className="mt-1 text-sm text-zinc-400">Create, book, and monitor first-party Paid Politely ad campaigns.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <div className="admin-card p-3">
            <p className="text-xl font-semibold">{formatNumber(currentBookings.length)}</p>
            <p className="text-xs text-zinc-500">current ads</p>
          </div>
          <div className="admin-card p-3">
            <p className="text-xl font-semibold">{formatNumber(bookingCount)}</p>
            <p className="text-xs text-zinc-500">bookings</p>
          </div>
          <div className="admin-card p-3">
            <p className="text-xl font-semibold">{formatNumber(impressions)}</p>
            <p className="text-xs text-zinc-500">views</p>
          </div>
          <div className="admin-card p-3">
            <p className="text-xl font-semibold">{formatNumber(clicks)}</p>
            <p className="text-xs text-zinc-500">clicks</p>
          </div>
          <div className="admin-card p-3">
            <p className="text-xl font-semibold">{formatPercent(weekClicks, weekImpressions)}</p>
            <p className="text-xs text-zinc-500">7 day CTR</p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Current ads and bookings</h2>
        <div className="admin-card overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ad</th>
                <th>Advertiser</th>
                <th>Placement</th>
                <th>Status</th>
                <th>Views</th>
                <th>Clicks</th>
                <th>CTR</th>
                <th>Limits</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => {
                const views = booking._count.impressions;
                const bookingClicks = booking._count.clicks;
                return (
                  <tr key={booking.id}>
                    <td className="max-w-[340px]">
                      <div className="font-medium">{booking.creative.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{booking.campaign.name}</div>
                      {booking.creative.headline && <div className="mt-1 text-sm text-zinc-400">{booking.creative.headline}</div>}
                    </td>
                    <td>
                      <div>{booking.campaign.advertiser.name}</div>
                      <div className="text-xs text-zinc-500">{booking.campaign.advertiser.contactEmail ?? booking.campaign.advertiser.websiteUrl ?? "no contact"}</div>
                    </td>
                    <td>
                      <div>{booking.placement.site.name}</div>
                      <div className="font-mono text-xs text-zinc-500">{booking.placement.key}</div>
                    </td>
                    <td className="space-y-1">
                      <div><span className={booking.enabled ? "badge badge-green" : "badge badge-zinc"}>{booking.enabled ? "enabled" : "disabled"}</span></div>
                      <div><span className={statusClass(booking.campaign.status)}>{booking.campaign.status}</span></div>
                      <div><span className={statusClass(booking.creative.status)}>{booking.creative.status}</span></div>
                    </td>
                    <td>{formatNumber(views)}</td>
                    <td>{formatNumber(bookingClicks)}</td>
                    <td>{formatPercent(bookingClicks, views)}</td>
                    <td className="text-xs text-zinc-500">
                      <div>{booking.maxImpressions ? `${formatNumber(booking.maxImpressions)} views` : "no view cap"}</div>
                      <div>{booking.maxClicks ? `${formatNumber(booking.maxClicks)} clicks` : "no click cap"}</div>
                      <div>{formatDateTime(booking.startsAt)} - {booking.endsAt ? formatDateTime(booking.endsAt) : "open"}</div>
                    </td>
                    <td>
                      <form action={toggleBooking.bind(null, booking.id, !booking.enabled)}>
                        <button className="button-secondary" type="submit">{booking.enabled ? "Pause" : "Enable"}</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {bookings.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-zinc-600">No ad bookings yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <form action={createAdPackage} className="admin-card space-y-5 p-5">
          <div>
            <h2 className="text-lg font-semibold">Create ad</h2>
            <p className="mt-1 text-sm text-zinc-500">Creates an advertiser, campaign, creative, and booking in one go.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Advertiser</span>
              <input className="field" name="advertiserName" placeholder="Sponsor name" required />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Contact</span>
              <input className="field" name="contactEmail" type="email" placeholder="email@example.com" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Website</span>
              <input className="field" name="websiteUrl" type="url" placeholder="https://example.com" />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="block space-y-1 text-sm md:col-span-2">
              <span className="text-zinc-400">Campaign</span>
              <input className="field" name="campaignName" placeholder="July homepage sponsor" required />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Status</span>
              <select className="field" name="campaignStatus" defaultValue={CampaignStatus.ACTIVE}>
                {Object.values(CampaignStatus).map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Pricing</span>
              <select className="field" name="pricingModel" defaultValue={PricingModel.FLAT}>
                {Object.values(PricingModel).map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Contract value</span>
              <input className="field" name="contractValue" inputMode="decimal" placeholder="250.00" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Currency</span>
              <input className="field" name="currency" defaultValue="GBP" maxLength={3} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Campaign starts</span>
              <input className="field" name="campaignStartsAt" type="datetime-local" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Campaign ends</span>
              <input className="field" name="campaignEndsAt" type="datetime-local" />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Creative name</span>
              <input className="field" name="creativeName" placeholder="Banner 970x250" required />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Category</span>
              <select className="field" name="category" defaultValue={AdultAdCategory.OTHER}>
                {Object.values(AdultAdCategory).map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm md:col-span-2">
              <span className="text-zinc-400">Target URL</span>
              <input className="field" name="targetUrl" type="url" placeholder="https://sponsor.example/landing" required />
            </label>
            <label className="block space-y-1 text-sm md:col-span-2">
              <span className="text-zinc-400">Image URL</span>
              <input className="field" name="imageUrl" type="url" placeholder="https://cdn.example/banner.png" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Headline</span>
              <input className="field" name="headline" placeholder="Advertise here" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">CTA</span>
              <input className="field" name="ctaText" placeholder="Learn more" />
            </label>
            <label className="block space-y-1 text-sm md:col-span-2">
              <span className="text-zinc-400">Body</span>
              <textarea className="field min-h-20" name="body" placeholder="Short ad copy" />
            </label>
            <label className="block space-y-1 text-sm md:col-span-2">
              <span className="text-zinc-400">Alt text</span>
              <input className="field" name="altText" placeholder="Describe the creative image" />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="block space-y-1 text-sm md:col-span-2">
              <span className="text-zinc-400">Placement</span>
              <select className="field" name="placementId" required>
                <option value="">Choose placement</option>
                {placements.map((placement) => (
                  <option key={placement.id} value={placement.id}>
                    {placement.site.key} / {placement.key} {bookedPlacementIds.has(placement.id) ? "(booked)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Priority</span>
              <input className="field" name="priority" type="number" defaultValue="0" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Weight</span>
              <input className="field" name="weight" type="number" defaultValue="100" min="1" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Max views</span>
              <input className="field" name="maxImpressions" type="number" min="0" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Max clicks</span>
              <input className="field" name="maxClicks" type="number" min="0" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Booking starts</span>
              <input className="field" name="bookingStartsAt" type="datetime-local" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Booking ends</span>
              <input className="field" name="bookingEndsAt" type="datetime-local" />
            </label>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
            <label className="flex items-center gap-2"><input name="approveNow" type="checkbox" defaultChecked /> Approve creative</label>
            <label className="flex items-center gap-2"><input name="bookingEnabled" type="checkbox" defaultChecked /> Enable booking</label>
            <label className="flex items-center gap-2"><input name="requiresAgeGate" type="checkbox" defaultChecked /> Requires age gate</label>
            <label className="flex items-center gap-2"><input name="containsExplicitImage" type="checkbox" /> Explicit image</label>
            <label className="flex items-center gap-2"><input name="containsExternalTracking" type="checkbox" /> External tracking</label>
          </div>

          <button className="button-primary" type="submit">Create ad booking</button>
        </form>

        <div className="space-y-6">
          <section className="admin-card p-5">
            <h2 className="text-lg font-semibold">Draft creatives</h2>
            <div className="mt-4 space-y-3">
              {pendingCreatives.map((creative) => (
                <div className="rounded-md border border-zinc-800 p-3" key={creative.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{creative.name}</p>
                      <p className="text-xs text-zinc-500">{creative.campaign.advertiser.name} / {creative.campaign.name}</p>
                    </div>
                    <span className={statusClass(creative.status)}>{creative.status}</span>
                  </div>
                  <form action={approveCreative.bind(null, creative.id)} className="mt-3">
                    <button className="button-secondary" type="submit">Approve</button>
                  </form>
                </div>
              ))}
              {pendingCreatives.length === 0 && <p className="text-sm text-zinc-600">No draft creatives waiting.</p>}
            </div>
          </section>

          <section className="admin-card p-5">
            <h2 className="text-lg font-semibold">Advertisers</h2>
            <div className="mt-4 space-y-3">
              {advertisers.map((advertiser) => (
                <div className="rounded-md border border-zinc-800 p-3" key={advertiser.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{advertiser.name}</p>
                      <p className="text-xs text-zinc-500">{advertiser.contactEmail ?? advertiser.websiteUrl ?? "no contact"}</p>
                    </div>
                    <span className={statusClass(advertiser.status)}>{advertiser.status}</span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-zinc-500">
                    {advertiser.campaigns.map((campaign) => (
                      <div className="flex justify-between gap-3" key={campaign.id}>
                        <span>{campaign.name}</span>
                        <span>{campaign._count.creatives} creatives, {campaign._count.bookings} bookings</span>
                      </div>
                    ))}
                    {advertiser.campaigns.length === 0 && <p>No campaigns.</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
