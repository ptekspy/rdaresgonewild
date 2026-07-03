import { NextRequest, NextResponse } from "next/server";
import { getTimelinePage, parseTimelineFilters } from "@/lib/timeline";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const filters = parseTimelineFilters(request.nextUrl.searchParams);
  const page = await getTimelinePage(filters);

  return NextResponse.json({
    ...page,
    filters,
  });
}
