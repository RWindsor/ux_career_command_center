"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { resumes, resumeAnalyses } from "@/lib/db/schema";
import { extractResumeData } from "@/lib/ai/gemini";
import { requireUserId } from "@/lib/auth/require-user";

async function runExtraction(resumeId: string, rawText: string) {
  const { analysis, model, rawResponse } = await extractResumeData(rawText);

  await db.insert(resumeAnalyses).values({
    resumeId,
    model,
    skills: analysis.skills,
    experienceSummary: analysis.experienceSummary,
    yearsOfExperience: analysis.yearsOfExperience,
    jobTitlesHeld: analysis.jobTitlesHeld,
    rawResponse,
  });
}

export async function createResume(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const label = String(formData.get("label") ?? "").trim();
  const rawText = String(formData.get("rawText") ?? "").trim();

  if (!label || !rawText) {
    return { error: "A label and the resume text are both required." };
  }

  const [resume] = await db.insert(resumes).values({ userId, label, rawText }).returning();

  revalidatePath("/dashboard/resumes");

  // The resume is saved regardless of what happens next — a flaky
  // Gemini call should never lose the text the user just pasted in.
  try {
    await runExtraction(resume.id, rawText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parsing failed.";
    redirect(`/dashboard/resumes?parseError=${encodeURIComponent(message)}`);
  }

  redirect("/dashboard/resumes");
}

export async function reparseResume(resumeId: string): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
  if (!resume || resume.userId !== userId) {
    throw new Error("Resume not found.");
  }

  try {
    await runExtraction(resume.id, resume.rawText);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Parsing failed." };
  }

  revalidatePath("/dashboard/resumes");
}

export async function deleteResume(resumeId: string): Promise<void> {
  const userId = await requireUserId();

  const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
  if (!resume || resume.userId !== userId) {
    throw new Error("Resume not found.");
  }

  await db.delete(resumes).where(eq(resumes.id, resumeId));
  revalidatePath("/dashboard/resumes");
}
