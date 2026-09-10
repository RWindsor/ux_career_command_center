import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { normalizeForDedupe } from "@/lib/ats/normalize";
import type { AtsProvider } from "@/lib/ats/types";

/**
 * Duplicate / repeat-job detection (product brief section B).
 *
 * Two tiers, checked in order:
 *  1. Exact — same user, same source ATS, same source job ID. Used to
 *     make repeated discovery runs idempotent: an exact match is never
 *     re-inserted.
 *  2. Likely — same user, same normalized company + title. Used to warn
 *     about reposted/boosted listings and repeat applications even when
 *     the source ID differs (e.g. a re-posted Greenhouse listing gets a
 *     new ID) or the job came from a different source entirely (e.g. a
 *     Greenhouse posting vs. one the user pasted manually earlier).
 *
 * Neither tier ever deletes anything — see app/actions/ats.ts for how
 * callers act on the result (skip insert, or insert flagged with
 * duplicateOfJobId for the user to resolve).
 */

export async function findExactDuplicate(userId: string, sourceName: AtsProvider, sourceJobId: string) {
  const [existing] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.sourceName, sourceName), eq(jobs.sourceJobId, sourceJobId)))
    .limit(1);
  return existing ?? null;
}

export async function findLikelyDuplicate(userId: string, company: string, title: string, excludeJobId?: string) {
  const normalizedCompany = normalizeForDedupe(company);
  const normalizedTitle = normalizeForDedupe(title);

  const matches = await db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.userId, userId), eq(jobs.normalizedCompany, normalizedCompany), eq(jobs.normalizedTitle, normalizedTitle))
    );

  return matches.find((job) => job.id !== excludeJobId) ?? null;
}

/** Same-company warning (product brief: "warn when another job from the same company already exists"). */
export async function findExistingJobsAtCompany(userId: string, company: string, excludeJobId?: string) {
  const normalizedCompany = normalizeForDedupe(company);
  const matches = await db.select().from(jobs).where(and(eq(jobs.userId, userId), eq(jobs.normalizedCompany, normalizedCompany)));
  return matches.filter((job) => job.id !== excludeJobId);
}
