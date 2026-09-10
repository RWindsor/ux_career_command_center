"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, jobAnalyses } from "@/lib/db/schema";
import { analyzeJobDescription } from "@/lib/ai/gemini";
import { requireUserId } from "@/lib/auth/require-user";
import { normalizeForDedupe } from "@/lib/ats/normalize";
import { findLikelyDuplicate } from "@/lib/ats/dedupe";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/pipeline";

async function runAnalysis(jobId: string, description: string) {
  const { analysis, model, rawResponse } = await analyzeJobDescription(description);

  await db.insert(jobAnalyses).values({
    jobId,
    model,
    summary: analysis.summary,
    seniorityLevel: analysis.seniorityLevel,
    employmentType: analysis.employmentType,
    yearsOfExperience: analysis.yearsOfExperience,
    salaryRange: analysis.salaryRange,
    keyResponsibilities: analysis.keyResponsibilities,
    requiredSkills: analysis.requiredSkills,
    niceToHaveSkills: analysis.niceToHaveSkills,
    keywords: analysis.keywords,
    rawResponse,
  });
}

export async function createJob(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const title = String(formData.get("title") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const jobUrl = String(formData.get("jobUrl") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!title || !company || !description) {
    return { error: "Title, company, and the job description are required." };
  }

  // Duplicate / repeat-job detection (product brief section B) applies to
  // manually-added jobs too, not just ATS-discovered ones.
  const likelyDuplicate = await findLikelyDuplicate(userId, company, title);

  const [job] = await db
    .insert(jobs)
    .values({
      userId,
      title,
      company,
      jobUrl: jobUrl || null,
      location: location || null,
      description,
      status: "interested",
      sourceName: "manual",
      normalizedCompany: normalizeForDedupe(company),
      normalizedTitle: normalizeForDedupe(title),
      duplicateOfJobId: likelyDuplicate?.id ?? null,
      duplicateReviewed: false,
    })
    .returning();

  revalidatePath("/dashboard/jobs");

  // The job is saved regardless of what happens next — a flaky Gemini
  // call should never lose the posting the user just pasted in.
  try {
    await runAnalysis(job.id, description);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";
    redirect(`/dashboard/jobs/${job.id}?analysisError=${encodeURIComponent(message)}`);
  }

  redirect(`/dashboard/jobs/${job.id}`);
}

export async function updateJobStatus(jobId: string, status: PipelineStage): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  if (!PIPELINE_STAGES.includes(status)) {
    return { error: "Invalid pipeline stage." };
  }

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.userId !== userId) {
    return { error: "Job not found." };
  }

  // Stage changes never touch notes/history — only the status column moves.
  await db.update(jobs).set({ status, updatedAt: new Date() }).where(eq(jobs.id, jobId));

  revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath("/dashboard/jobs");
}

export async function setOfferCompensation(jobId: string, offerCompensation: string): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.userId !== userId) {
    return { error: "Job not found." };
  }

  await db.update(jobs).set({ offerCompensation: offerCompensation.trim() || null, updatedAt: new Date() }).where(eq(jobs.id, jobId));
  revalidatePath(`/dashboard/jobs/${jobId}/offer`);
}

export async function reanalyzeJob(jobId: string): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.userId !== userId) {
    throw new Error("Job not found.");
  }

  try {
    await runAnalysis(job.id, job.description);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Analysis failed." };
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function deleteJob(jobId: string): Promise<void> {
  const userId = await requireUserId();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.userId !== userId) {
    throw new Error("Job not found.");
  }

  await db.delete(jobs).where(eq(jobs.id, jobId));
  revalidatePath("/dashboard/jobs");
  redirect("/dashboard/jobs");
}
