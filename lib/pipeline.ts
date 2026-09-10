import type { Job } from "@/lib/db/schema";

/**
 * The detailed application pipeline from the product brief. Order here
 * is the canonical display order everywhere in the UI (pipeline board,
 * status selects, weekly report breakdowns).
 *
 * "saved", "interviewing", and "archived" are legacy values from before
 * this pipeline existed (see lib/db/schema.ts) — they're mapped into a
 * stage group below so old rows still render sensibly, but they're not
 * offered as choices for new/edited jobs.
 */
export const PIPELINE_STAGES = [
  "discovered",
  "interested",
  "applying",
  "applied",
  "recruiter_screen",
  "hiring_manager_interview",
  "portfolio_review",
  "panel_interview",
  "final_round",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<Job["status"], string> = {
  discovered: "Discovered",
  interested: "Interested",
  applying: "Applying",
  applied: "Applied",
  recruiter_screen: "Recruiter Screen",
  hiring_manager_interview: "Hiring Manager Interview",
  portfolio_review: "Portfolio Review",
  panel_interview: "Panel Interview",
  final_round: "Final Round",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  // Legacy buckets — shown with a small suffix so it's clear they predate the detailed pipeline.
  saved: "Interested (legacy)",
  interviewing: "Interviewing (legacy)",
  archived: "Archived (legacy)",
};

/** Interview-stage entry points (Interview Prep) become relevant once a job reaches one of these. */
export const INTERVIEW_STAGES: Job["status"][] = [
  "recruiter_screen",
  "hiring_manager_interview",
  "portfolio_review",
  "panel_interview",
  "final_round",
  "interviewing", // legacy
];

export function isInterviewStage(status: Job["status"]): boolean {
  return INTERVIEW_STAGES.includes(status);
}

export function isOfferStage(status: Job["status"]): boolean {
  return status === "offer";
}

/** Groups a job's raw status (including legacy values) into one of the 12 canonical stages, for board/report display. */
export function toDisplayStage(status: Job["status"]): PipelineStage {
  switch (status) {
    case "saved":
      return "interested";
    case "interviewing":
      return "recruiter_screen";
    case "archived":
      return "withdrawn";
    default:
      return status;
  }
}

/**
 * Match-scoring tiers from the product brief. Presentation-only — the
 * stored score stays 0-100 (job_matches.score); this just buckets it.
 */
export function matchTier(score: number): "A" | "B" | "C" | "D" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

export const TIER_LABELS: Record<"A" | "B" | "C" | "D", string> = {
  A: "Tier A · Highest priority",
  B: "Tier B",
  C: "Tier C",
  D: "Tier D",
};
