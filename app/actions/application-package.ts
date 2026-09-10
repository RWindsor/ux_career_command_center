"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, jobAnalyses, resumes, resumeAnalyses, jobMatches, applicationPackages } from "@/lib/db/schema";
import { generateApplicationPackage } from "@/lib/ai/gemini";
import { requireUserId } from "@/lib/auth/require-user";

/**
 * AI Application Assistant (product brief section D). Generates and
 * persists a full application package for a (job, resume) pair —
 * append-only, like interview preps, so regenerating never destroys a
 * prior draft.
 */
export async function createApplicationPackage(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const jobId = String(formData.get("jobId") ?? "");
  const resumeId = String(formData.get("resumeId") ?? "");

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.userId !== userId) return { error: "Job not found." };

  const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
  if (!resume || resume.userId !== userId) return { error: "Resume not found." };

  const [analysis] = await db
    .select()
    .from(jobAnalyses)
    .where(eq(jobAnalyses.jobId, jobId))
    .orderBy(desc(jobAnalyses.createdAt))
    .limit(1);
  if (!analysis) return { error: "This job doesn't have a Gemini analysis yet — analyze it first from the job's page." };

  const [resumeAnalysis] = await db
    .select()
    .from(resumeAnalyses)
    .where(eq(resumeAnalyses.resumeId, resumeId))
    .orderBy(desc(resumeAnalyses.createdAt))
    .limit(1);
  if (!resumeAnalysis) return { error: "This resume hasn't been parsed yet — re-parse it from the Resume Library first." };

  const [latestMatch] = await db
    .select()
    .from(jobMatches)
    .where(eq(jobMatches.jobId, jobId))
    .orderBy(desc(jobMatches.createdAt))
    .limit(1);

  try {
    const { package: pkg, model, rawResponse } = await generateApplicationPackage({
      jobTitle: job.title,
      company: job.company,
      jobSummary: analysis.summary,
      seniorityLevel: analysis.seniorityLevel,
      requiredSkills: analysis.requiredSkills,
      niceToHaveSkills: analysis.niceToHaveSkills,
      keyResponsibilities: analysis.keyResponsibilities,
      resumeLabel: resume.label,
      resumeExperienceSummary: resumeAnalysis.experienceSummary,
      resumeYearsOfExperience: resumeAnalysis.yearsOfExperience,
      resumeSkills: resumeAnalysis.skills,
      resumeJobTitlesHeld: resumeAnalysis.jobTitlesHeld,
      matchScore: latestMatch?.score ?? null,
      matchGaps: latestMatch?.gaps ?? [],
    });

    await db.insert(applicationPackages).values({
      jobId,
      resumeId,
      model,
      keywordGapAnalysis: pkg.keywordGapAnalysis,
      resumeTailoringRecommendations: pkg.resumeTailoringRecommendations,
      experienceToForeground: pkg.experienceToForeground,
      applicationStrategyNotes: pkg.applicationStrategyNotes,
      coverLetterDraft: pkg.coverLetterDraft,
      recruiterOutreachMessage: pkg.recruiterOutreachMessage,
      rawResponse,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Application package generation failed." };
  }

  revalidatePath(`/dashboard/jobs/${jobId}/application-package`);
}

export async function getApplicationPackages(jobId: string) {
  return db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.jobId, jobId))
    .orderBy(desc(applicationPackages.createdAt));
}
