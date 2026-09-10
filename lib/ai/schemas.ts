import { z } from "zod";

/**
 * Runtime shape of a job-description analysis. This mirrors the
 * responseSchema passed to Gemini in lib/ai/gemini.ts — Gemini's schema
 * constrains what the model *can* emit, this validates what it actually
 * did emit before anything touches the database.
 */
export const jobAnalysisSchema = z.object({
  summary: z.string().min(1),
  seniorityLevel: z.string().nullable(),
  employmentType: z.string().nullable(),
  yearsOfExperience: z.string().nullable(),
  salaryRange: z.string().nullable(),
  keyResponsibilities: z.array(z.string()).default([]),
  requiredSkills: z.array(z.string()).default([]),
  niceToHaveSkills: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
});

export type JobAnalysisResult = z.infer<typeof jobAnalysisSchema>;

/**
 * Structured facts pulled from a resume — the "stored resume data" that
 * Match Scoring compares against a job's jobAnalysisSchema output.
 */
export const resumeExtractionSchema = z.object({
  skills: z.array(z.string()).default([]),
  experienceSummary: z.string().min(1),
  yearsOfExperience: z.string().nullable(),
  jobTitlesHeld: z.array(z.string()).default([]),
});

export type ResumeExtractionResult = z.infer<typeof resumeExtractionSchema>;

/**
 * Output of comparing a resume's extraction against a job's analysis.
 */
export const matchScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

export type MatchScoreResult = z.infer<typeof matchScoreSchema>;

/**
 * Phase 5 — Interview Prep Center output.
 */
export const interviewPrepSchema = z.object({
  companyResearch: z.string().min(1),
  interviewQuestions: z
    .array(
      z.object({
        category: z.string(),
        question: z.string(),
      })
    )
    .default([]),
  starStories: z
    .array(
      z.object({
        question: z.string(),
        suggestedStory: z.string(),
        resumeEvidence: z.string(),
      })
    )
    .default([]),
  portfolioRecommendations: z.array(z.string()).default([]),
  recruiterScreenPrep: z.array(z.string()).default([]),
  hiringManagerPrep: z.array(z.string()).default([]),
  portfolioPresentationPrep: z.array(z.string()).default([]),
});

export type InterviewPrepResult = z.infer<typeof interviewPrepSchema>;

/**
 * Phase 7 — Weekly Career Report output. The numeric stats themselves
 * are computed in app/actions/reports.ts from the database, not by
 * Gemini — this schema only covers the narrative summary and
 * recommendations Gemini writes about those stats.
 */
export const weeklyReportSchema = z.object({
  summary: z.string().min(1),
  recommendations: z.array(z.string()).default([]),
});

export type WeeklyReportResult = z.infer<typeof weeklyReportSchema>;

/**
 * AI Application Assistant output. Every field must be traceable to the
 * job/resume data actually provided — see the "never invent experience"
 * rule in lib/ai/prompts.ts.
 */
export const applicationPackageSchema = z.object({
  keywordGapAnalysis: z.array(z.string()).default([]),
  resumeTailoringRecommendations: z.array(z.string()).default([]),
  experienceToForeground: z.array(z.string()).default([]),
  applicationStrategyNotes: z.string().min(1),
  coverLetterDraft: z.string().min(1),
  recruiterOutreachMessage: z.string().min(1),
});

export type ApplicationPackageResult = z.infer<typeof applicationPackageSchema>;

/**
 * Offer, Negotiation & Onboarding Center output. `negotiationGuide` and
 * `negotiationTalkingPoints` must work from whatever compensation
 * context was supplied (job posting + user-entered offer details) —
 * never invented market-rate numbers.
 */
export const offerPrepSchema = z.object({
  offerEvaluationChecklist: z.array(z.string()).default([]),
  negotiationGuide: z.string().min(1),
  questionsToAskBeforeAccepting: z.array(z.string()).default([]),
  negotiationTalkingPoints: z.array(z.string()).default([]),
  onboardingPlan30: z.array(z.string()).default([]),
  onboardingPlan60: z.array(z.string()).default([]),
  onboardingPlan90: z.array(z.string()).default([]),
});

export type OfferPrepResult = z.infer<typeof offerPrepSchema>;
