"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, jobAnalyses, resumes, resumeAnalyses, interviewPreps } from "@/lib/db/schema";
import { generateInterviewPrep } from "@/lib/ai/gemini";
import { requireUserId } from "@/lib/auth/require-user";

export async function createInterviewPrep(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const jobId = String(formData.get("jobId") ?? "");
  const resumeId = String(formData.get("resumeId") ?? "").trim();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.userId !== userId) {
    return { error: "Job not found." };
  }

  const [analysis] = await db
    .select()
    .from(jobAnalyses)
    .where(eq(jobAnalyses.jobId, jobId))
    .orderBy(desc(jobAnalyses.createdAt))
    .limit(1);

  if (!analysis) {
    return { error: "This job doesn't have a Gemini analysis yet — analyze it first from the job's page." };
  }

  let resumeExperienceSummary: string | null = null;
  let resumeYearsOfExperience: string | null = null;
  let resumeSkills: string[] = [];
  let resumeJobTitlesHeld: string[] = [];

  if (resumeId) {
    const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
    if (!resume || resume.userId !== userId) {
      return { error: "Resume not found." };
    }
    const [resumeAnalysis] = await db
      .select()
      .from(resumeAnalyses)
      .where(eq(resumeAnalyses.resumeId, resumeId))
      .orderBy(desc(resumeAnalyses.createdAt))
      .limit(1);

    if (resumeAnalysis) {
      resumeExperienceSummary = resumeAnalysis.experienceSummary;
      resumeYearsOfExperience = resumeAnalysis.yearsOfExperience;
      resumeSkills = resumeAnalysis.skills;
      resumeJobTitlesHeld = resumeAnalysis.jobTitlesHeld;
    }
  }

  try {
    const { prep, model, rawResponse } = await generateInterviewPrep({
      jobTitle: job.title,
      company: job.company,
      jobSummary: analysis.summary,
      seniorityLevel: analysis.seniorityLevel,
      requiredSkills: analysis.requiredSkills,
      niceToHaveSkills: analysis.niceToHaveSkills,
      keyResponsibilities: analysis.keyResponsibilities,
      resumeExperienceSummary,
      resumeYearsOfExperience,
      resumeSkills,
      resumeJobTitlesHeld,
    });

    await db.insert(interviewPreps).values({
      jobId,
      resumeId: resumeId || null,
      model,
      companyResearch: prep.companyResearch,
      interviewQuestions: prep.interviewQuestions,
      starStories: prep.starStories,
      portfolioRecommendations: prep.portfolioRecommendations,
      recruiterScreenPrep: prep.recruiterScreenPrep,
      hiringManagerPrep: prep.hiringManagerPrep,
      portfolioPresentationPrep: prep.portfolioPresentationPrep,
      rawResponse,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Interview prep generation failed." };
  }

  revalidatePath(`/dashboard/jobs/${jobId}/interview-prep`);
  revalidatePath("/dashboard/interview-prep");
}
