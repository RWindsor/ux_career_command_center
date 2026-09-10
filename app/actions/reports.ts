"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  jobs,
  jobMatches,
  recruiterContacts,
  recruiterContactHistory,
  contractOpportunities,
  weeklyReports,
} from "@/lib/db/schema";
import { generateWeeklyReportNarrative } from "@/lib/ai/gemini";
import { requireUserId } from "@/lib/auth/require-user";

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Computes the Phase 7 dashboard analytics snapshot for the current
 * user. Pure read — used by both the dashboard page (rendered stats)
 * and generateWeeklyReport (fed to Gemini as context).
 */
export async function getPipelineStats(userId: string) {
  const weekStart = startOfWeek(new Date());

  const userJobs = await db.select().from(jobs).where(eq(jobs.userId, userId));
  const submitted = userJobs.filter((j) => j.status !== "saved");
  const applicationsSubmittedThisWeek = submitted.filter((j) => j.createdAt >= weekStart).length;
  const jobsAddedThisWeek = userJobs.filter((j) => j.createdAt >= weekStart).length;

  const interviewingCount = userJobs.filter((j) => j.status === "interviewing").length;
  const offerCount = userJobs.filter((j) => j.status === "offer").length;
  const rejectedCount = userJobs.filter((j) => j.status === "rejected").length;
  const activeOpportunities = userJobs.filter((j) => j.status === "applied" || j.status === "interviewing").length;

  const appliedOrLater = userJobs.filter((j) => j.status !== "saved" && j.status !== "archived").length;
  const interviewConversionRate =
    appliedOrLater > 0 ? Math.round(((interviewingCount + offerCount) / appliedOrLater) * 100) : null;
  const rejectionRate = appliedOrLater > 0 ? Math.round((rejectedCount / appliedOrLater) * 100) : null;

  const pipelineBreakdown: Record<string, number> = {};
  for (const job of userJobs) {
    pipelineBreakdown[job.status] = (pipelineBreakdown[job.status] ?? 0) + 1;
  }

  const jobIds = userJobs.map((j) => j.id);
  const allMatches = jobIds.length > 0 ? await db.select().from(jobMatches) : [];
  const latestScoreByJob = new Map<string, number>();
  for (const match of allMatches) {
    if (!jobIds.includes(match.jobId)) continue;
    if (!latestScoreByJob.has(match.jobId) || latestScoreByJob.get(match.jobId)! < match.score) {
      latestScoreByJob.set(match.jobId, match.score);
    }
  }
  const topMatches = [...latestScoreByJob.entries()]
    .map(([jobId, score]) => {
      const job = userJobs.find((j) => j.id === jobId)!;
      return { title: job.title, company: job.company, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const contacts = await db.select().from(recruiterContacts).where(eq(recruiterContacts.userId, userId));
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingFollowUps = contacts.filter(
    (c) => c.followUpDate && c.followUpDate >= now && c.followUpDate <= in7Days
  ).length;
  const overdueFollowUps = contacts.filter(
    (c) => c.followUpDate && c.followUpDate < now && c.status !== "placed" && c.status !== "inactive"
  ).length;

  const contactIds = contacts.map((c) => c.id);
  const recentHistory =
    contactIds.length > 0
      ? await db.select().from(recruiterContactHistory).where(gte(recruiterContactHistory.contactedAt, weekStart))
      : [];
  const contactedThisWeek = recentHistory.filter((h) => contactIds.includes(h.contactId)).length;

  const contractOppsAll = await db.select().from(contractOpportunities).where(eq(contractOpportunities.userId, userId));
  const activeContractOpps = contractOppsAll.filter((o) =>
    ["submitted", "interviewing", "offer"].includes(o.status)
  ).length;

  const recruiterPipelineBreakdown: Record<string, number> = {};
  for (const contact of contacts) {
    recruiterPipelineBreakdown[contact.status] = (recruiterPipelineBreakdown[contact.status] ?? 0) + 1;
  }

  return {
    weekStart,
    jobsAddedThisWeek,
    applicationsSubmittedThisWeek,
    totalActiveOpportunities: activeOpportunities + activeContractOpps,
    interviewingCount,
    offerCount,
    rejectedCount,
    interviewConversionRate,
    rejectionRate,
    topMatches,
    pipelineBreakdown,
    recruiterPipelineBreakdown,
    recruiterActivity: {
      totalContacts: contacts.length,
      contactedThisWeek,
      upcomingFollowUps,
      overdueFollowUps,
    },
  };
}

export async function getLatestWeeklyReport(userId: string) {
  const [report] = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.userId, userId))
    .orderBy(desc(weeklyReports.createdAt))
    .limit(1);
  return report ?? null;
}

/**
 * Core generation logic, callable with an explicit userId so it can be
 * reused by both the user-triggered server action below and the
 * Vercel Cron route (app/api/cron/weekly-report), which has no session
 * to pull a userId from and loops over every user instead.
 *
 * Idempotent per ISO week: if a report already exists for the computed
 * weekStart, this returns it instead of generating a duplicate — safe
 * for a cron job that might fire more than once.
 */
export async function generateWeeklyReportForUser(userId: string): Promise<{ error: string } | { skipped: true } | void> {
  const stats = await getPipelineStats(userId);

  const [existingThisWeek] = await db
    .select()
    .from(weeklyReports)
    .where(and(eq(weeklyReports.userId, userId), eq(weeklyReports.weekStart, stats.weekStart)))
    .limit(1);
  if (existingThisWeek) return { skipped: true };

  try {
    const { report, model, rawResponse } = await generateWeeklyReportNarrative({
      weekStart: stats.weekStart.toISOString().slice(0, 10),
      jobsAddedThisWeek: stats.jobsAddedThisWeek,
      applicationsSubmittedThisWeek: stats.applicationsSubmittedThisWeek,
      totalActiveOpportunities: stats.totalActiveOpportunities,
      interviewingCount: stats.interviewingCount,
      offerCount: stats.offerCount,
      rejectedCount: stats.rejectedCount,
      interviewConversionRate: stats.interviewConversionRate,
      rejectionRate: stats.rejectionRate,
      topMatches: stats.topMatches,
      pipelineBreakdown: stats.pipelineBreakdown,
      recruiterActivity: stats.recruiterActivity,
    });

    await db.insert(weeklyReports).values({
      userId,
      weekStart: stats.weekStart,
      summary: report.summary,
      recommendations: report.recommendations,
      stats,
      model,
      rawResponse,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Weekly report generation failed." };
  }
}

export async function generateWeeklyReport(): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  const result = await generateWeeklyReportForUser(userId);
  if (result && "error" in result) return result;
  revalidatePath("/dashboard");
}
