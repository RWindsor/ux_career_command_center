"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, jobAnalyses, resumes, resumeAnalyses, offerPreps } from "@/lib/db/schema";
import { generateOfferPrep } from "@/lib/ai/gemini";
import { requireUserId } from "@/lib/auth/require-user";

/**
 * Offer, Negotiation & Onboarding Center (product brief section E).
 * Relevant once a job reaches the Offer stage (see lib/pipeline.ts,
 * isOfferStage). Never fabricates compensation data — see the system
 * instruction in lib/ai/prompts.ts; the only compensation input is
 * jobs.offerCompensation, which the user enters themselves.
 */
export async function createOfferPrep(_prevState: unknown, formData: FormData): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const jobId = String(formData.get("jobId") ?? "");
  const resumeId = String(formData.get("resumeId") ?? "").trim();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.userId !== userId) return { error: "Job not found." };

  const [analysis] = await db
    .select()
    .from(jobAnalyses)
    .where(eq(jobAnalyses.jobId, jobId))
    .orderBy(desc(jobAnalyses.createdAt))
    .limit(1);
  if (!analysis) return { error: "This job doesn't have a Gemini analysis yet — analyze it first from the job's page." };

  let resumeExperienceSummary: string | null = null;
  let resumeSkills: string[] = [];

  if (resumeId) {
    const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
    if (!resume || resume.userId !== userId) return { error: "Resume not found." };
    const [resumeAnalysis] = await db
      .select()
      .from(resumeAnalyses)
      .where(eq(resumeAnalyses.resumeId, resumeId))
      .orderBy(desc(resumeAnalyses.createdAt))
      .limit(1);
    if (resumeAnalysis) {
      resumeExperienceSummary = resumeAnalysis.experienceSummary;
      resumeSkills = resumeAnalysis.skills;
    }
  }

  const compensationContext = job.offerCompensation?.trim() || "";

  try {
    const { prep, model, rawResponse } = await generateOfferPrep({
      jobTitle: job.title,
      company: job.company,
      jobSummary: analysis.summary,
      seniorityLevel: analysis.seniorityLevel,
      keyResponsibilities: analysis.keyResponsibilities,
      compensationContext,
      resumeExperienceSummary,
      resumeSkills,
    });

    await db.insert(offerPreps).values({
      jobId,
      model,
      compensationContext: compensationContext || "None provided.",
      offerEvaluationChecklist: prep.offerEvaluationChecklist,
      negotiationGuide: prep.negotiationGuide,
      questionsToAskBeforeAccepting: prep.questionsToAskBeforeAccepting,
      negotiationTalkingPoints: prep.negotiationTalkingPoints,
      onboardingPlan30: prep.onboardingPlan30,
      onboardingPlan60: prep.onboardingPlan60,
      onboardingPlan90: prep.onboardingPlan90,
      rawResponse,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Offer prep generation failed." };
  }

  revalidatePath(`/dashboard/jobs/${jobId}/offer`);
}

export async function getOfferPreps(jobId: string) {
  return db.select().from(offerPreps).where(eq(offerPreps.jobId, jobId)).orderBy(desc(offerPreps.createdAt));
}
