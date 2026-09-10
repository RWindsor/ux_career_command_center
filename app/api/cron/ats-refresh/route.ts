import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { runDiscoveryForUser } from "@/app/actions/ats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled ATS discovery refresh (product brief section G). Configured
 * in vercel.json. Vercel automatically sends `Authorization: Bearer
 * $CRON_SECRET` on Cron-triggered requests once CRON_SECRET is set as
 * an env var — see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 *
 * Idempotent: runDiscoveryForSource (lib powering runDiscoveryForUser)
 * skips any listing that's an exact duplicate of one already imported,
 * so firing this more than once for the same window can't create
 * duplicate jobs.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allUsers = await db.select({ id: users.id }).from(users);

  const results = [];
  for (const user of allUsers) {
    const result = await runDiscoveryForUser(user.id);
    results.push({ userId: user.id, ...result });
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    usersProcessed: results.length,
    totalJobsCreated: results.reduce((sum, r) => sum + r.jobsCreated, 0),
    results,
  });
}
