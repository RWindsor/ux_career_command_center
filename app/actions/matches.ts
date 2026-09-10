"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, jobAnalyses, resumes, resumeAnalyses, jobMatches } from "@/lib/db/schema";
import { scoreMatch } from "@/lib/ai/gemini";
import { requireUserId } from "@/lib/auth/require-user";

export async function runMatchScore(jobId: string, resumeId: string): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.userId !== userId) {
    return { error: "Job not found." };
  }

  const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
  if (!resume || resume.userId !== userId) {
    return { error: "Resume not found." };
  }

  const [latestJobAnalysis] = await db
    .select()
    .from(jobAnalyses)
    .where(eq(jobAnalyses.jobId, jobId))
    .orderBy(desc(jobAnalyses.createdAt))
    .limit(1);
  if (!latestJobAnalysis) {
    return { error: 'This job has no analysis yet — run "Re-analyze" on the job first.' };
  }

  const [latestResumeAnalysis] = await db
    .select()
    .from(resumeAnalyses)
    .where(eq(resumeAnalyses.resumeId, resumeId))
    .orderBy(desc(resumeAnalyses.createdAt))
    .limit(1);
  if (!latestResumeAnalysis) {
    return { error: "This resume hasn't been parsed yet — re-parse it from the Resume Library first." };
  }

  try {
    const { match, model, rawResponse } = await scoreMatch({
      jobTitle: job.title,
      company: job.company,
      jobSummary: latestJobAnalysis.summary,
      seniorityLevel: latestJobAnalysis.seniorityLevel,
      requiredSkills: latestJobAnalysis.requiredSkills,
      niceToHaveSkills: latestJobAnalysis.niceToHaveSkills,
      keyResponsibilities: latestJobAnalysis.keyResponsibilities,
      resumeExperienceSummary: latestResumeAnalysis.experienceSummary,
      resumeYearsOfExperience: latestResumeAnalysis.yearsOfExperience,
      resumeSkills: latestResumeAnalysis.skills,
      resumeJobTitlesHeld: latestResumeAnalysis.jobTitlesHeld,
    });

    await db.insert(jobMatches).values({
      jobId,
      resumeId,
      model,
      score: match.score,
      strengths: match.strengths,
      gaps: match.gaps,
      recommendations: match.recommendations,
      rawResponse,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Match scoring failed." };
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
}
