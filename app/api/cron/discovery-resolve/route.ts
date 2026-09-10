import { NextResponse } from "next/server";
import { resolveAllSavedSearches } from "@/app/actions/saved-searches";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled saved-search resolution — finds newly-listed company boards
 * matching each user's saved search criteria and starts watching them
 * (see lib/discovery/board-resolver.ts for the search-provider
 * dependency and its documented limitation). Runs separately from, and
 * less often than, /api/cron/ats-refresh: this discovers NEW boards;
 * ats-refresh polls ALL known boards (manually added + discovered) for
 * new postings. Shares the CRON_SECRET auth pattern — see
 * app/api/cron/ats-refresh/route.ts.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await resolveAllSavedSearches();
  return NextResponse.json({ ranAt: new Date().toISOString(), ...result });
}
