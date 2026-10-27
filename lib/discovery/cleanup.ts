import type { NormalizedListing, AtsProvider } from "@/lib/ats/types";
import { applicableSearches, evaluateListing, isAggregatorUrl, isSourceBlocked, type SearchCriteria, type SourceInfo } from "@/lib/discovery/eligibility";

/**
 * Pure classification used by the cleanup PREVIEW (scripts/discovery-maintenance.ts). No DB access.
 * Re-evaluates already-stored auto-discovered jobs against today's rules using only the text we saved
 * (title, location, description, URL) — structured ATS hints were never stored for old rows, so old
 * rows lean toward "review" rather than "archive" whenever the text is silent.
 */

export interface StoredJob {
  id: string;
  title: string;
  company: string;
  location: string | null;
  description: string;
  sourceName: string;
  sourceJobId: string | null;
  jobUrl: string | null;
  sourceUrl: string | null;
  status: string;
  notes: string | null;
  offerCompensation: string | null;
  duplicateReviewed: boolean;
  discoveryState: string | null;
  autoArchivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobActivity {
  matches: number;
  applicationPackages: number;
  interviewPreps: number;
  offerPreps: number;
}

export type Bucket = "archive" | "review" | "keep" | "protected" | "skip";

export interface Classification {
  bucket: Bucket;
  code: string;
  reason: string;
}

export const TOUCH_WINDOW_MS = 10_000;

/** Why a job must never be auto-archived (user touched it), or null if it's still untouched. */
export function protectedReason(job: StoredJob, activity: JobActivity): string | null {
  if (job.sourceName === "manual") return "manual entry";
  if (job.status !== "discovered") return `status is "${job.status}" (saved/applied/interviewing/etc.)`;
  if (job.notes && job.notes.trim()) return "has your notes";
  if (job.offerCompensation && job.offerCompensation.trim()) return "has offer compensation";
  if (job.duplicateReviewed) return "you reviewed its duplicate flag";
  if (activity.interviewPreps > 0) return "has interview prep";
  if (activity.offerPreps > 0) return "has offer prep";
  if (activity.applicationPackages > 0) return "has an application package";
  if (activity.matches > 0) return "has a match score you ran";
  if (job.updatedAt.getTime() - job.createdAt.getTime() > TOUCH_WINDOW_MS) return "row was edited after import";
  return null;
}

/** Extracts the board token from a posting URL on a known ATS host (used to link legacy jobs to a watched source). */
export function boardTokenFromUrl(url: string | null | undefined): { provider: AtsProvider; token: string } | null {
  if (!url) return null;
  const patterns: [AtsProvider, RegExp][] = [
    ["greenhouse", /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i],
    ["lever", /jobs\.lever\.co\/([a-z0-9_-]+)/i],
    ["ashby", /jobs\.ashbyhq\.com\/([a-z0-9_.%-]+)/i],
    ["smartrecruiters", /jobs\.smartrecruiters\.com\/([a-z0-9_-]+)/i],
  ];
  for (const [provider, re] of patterns) {
    const m = url.match(re);
    if (m) return { provider, token: decodeURIComponent(m[1]).toLowerCase() };
  }
  return null;
}

export function classifyStoredJob(
  job: StoredJob,
  activity: JobActivity,
  ctx: { searches: SearchCriteria[]; source: SourceInfo | null }
): Classification {
  if (job.status === "archived") return { bucket: "skip", code: "already_archived", reason: "already archived" };
  if (job.discoveryState) return { bucket: "skip", code: "already_gated", reason: "imported under the new rules" };

  const guard = protectedReason(job, activity);
  if (guard) return { bucket: "protected", code: "protected", reason: guard };

  const url = job.jobUrl ?? job.sourceUrl;
  if (ctx.source && isSourceBlocked(ctx.source)) {
    return { bucket: "archive", code: "excluded_source", reason: "came from an excluded source" };
  }
  if (!(ctx.source?.exclusionOverride) && (isAggregatorUrl(job.jobUrl) || isAggregatorUrl(job.sourceUrl))) {
    return { bucket: "archive", code: "aggregator_url", reason: "posting URL is hosted by an aggregator" };
  }

  // If nothing enabled covers this ATS, HOLD — never propose mass-archiving just because searches are paused.
  if (applicableSearches(ctx.searches, job.sourceName).length === 0) {
    return { bucket: "keep", code: "no_enabled_search_hold", reason: "no enabled saved search covers this ATS — not evaluated" };
  }

  const listing: NormalizedListing = {
    sourceName: job.sourceName as AtsProvider,
    sourceJobId: job.sourceJobId ?? job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    url,
  };
  const decision = evaluateListing(listing, applicableSearches(ctx.searches, job.sourceName));
  if (decision.decision === "accept") return { bucket: "keep", code: "ok", reason: decision.reason };
  if (decision.decision === "review") return { bucket: "review", code: decision.codes[0] ?? "review", reason: decision.reason };
  return { bucket: "archive", code: decision.code, reason: decision.reason };
}
