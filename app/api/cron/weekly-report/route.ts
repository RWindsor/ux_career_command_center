import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { generateWeeklyReportForUser } from "@/app/actions/reports";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled weekly career report generation (product brief section G).
 * Configured in vercel.json. See app/api/cron/ats-refresh/route.ts for
 * the CRON_SECRET auth pattern this shares.
 *
 * Idempotent: generateWeeklyReportForUser skips any user who already
 * has a report for the current ISO week, so firing this more than once
 * can't create duplicate reports.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allUsers = await db.select({ id: users.id }).from(users);

  const results = [];
  for (const user of allUsers) {
    const result = await generateWeeklyReportForUser(user.id);
    results.push({ userId: user.id, ...(result ?? { generated: true }) });
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), usersProcessed: results.length, results });
}
