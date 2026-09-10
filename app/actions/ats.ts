"use server";

import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { atsWatchedSources, jobs, savedSearches, type AtsWatchedSource } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/require-user";
import { ATS_ADAPTERS } from "@/lib/ats";
import { matchesDesignRole, normalizeForDedupe } from "@/lib/ats/normalize";
import { matchesSearchCriteria } from "@/lib/discovery/search-match";
import { findExactDuplicate, findLikelyDuplicate } from "@/lib/ats/dedupe";
import { AtsFetchError, type AtsProvider } from "@/lib/ats/types";
import { analyzeJobDescription } from "@/lib/ai/gemini";
import { jobAnalyses } from "@/lib/db/schema";

const VALID_PROVIDERS: AtsProvider[] = ["greenhouse", "lever", "ashby", "smartrecruiters", "workday"];

export async function createWatchedSource(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const provider = String(formData.get("provider") ?? "") as AtsProvider;
  const boardToken = String(formData.get("boardToken") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();

  if (!VALID_PROVIDERS.includes(provider)) {
    return { error: "Choose a valid ATS provider." };
  }
  if (!boardToken) {
    return { error: "The board token / company identifier is required." };
  }

  await db.insert(atsWatchedSources).values({
    userId,
    provider,
    boardToken,
    label: label || `${boardToken} (${provider})`,
  });

  revalidatePath("/dashboard/discovery");
}

export async function deleteWatchedSource(sourceId: string): Promise<void> {
  const userId = await requireUserId();
  const [source] = await db.select().from(atsWatchedSources).where(eq(atsWatchedSources.id, sourceId)).limit(1);
  if (!source || source.userId !== userId) throw new Error("Watched source not found.");

  await db.delete(atsWatchedSources).where(eq(atsWatchedSources.id, sourceId));
  revalidatePath("/dashboard/discovery");
}

export async function toggleWatchedSource(sourceId: string, enabled: boolean): Promise<void> {
  const userId = await requireUserId();
  const [source] = await db.select().from(atsWatchedSources).where(eq(atsWatchedSources.id, sourceId)).limit(1);
  if (!source || source.userId !== userId) throw new Error("Watched source not found.");

  await db.update(atsWatchedSources).set({ enabled, updatedAt: new Date() }).where(eq(atsWatchedSources.id, sourceId));
  revalidatePath("/dashboard/discovery");
}

/**
 * Runs discovery for one watched source: fetch → filter to design roles
 * → normalize → deduplicate → persist. Shared by the "Run now" button
 * (app/actions/ats.ts, user-triggered) and the Vercel Cron route
 * (app/api/cron/ats-refresh) — same code path either way, so behavior
 * never diverges between manual and scheduled runs.
 *
 * Safe to re-run: exact duplicates (same source + source job ID) are
 * never re-inserted, so repeated execution can't create duplicate rows.
 */
export async function runDiscoveryForSource(source: AtsWatchedSource): Promise<{ found: number; created: number }> {
  const adapter = ATS_ADAPTERS[source.provider as AtsProvider];

  if (!adapter.supportsAutomatedFetch) {
    await db
      .update(atsWatchedSources)
      .set({
        lastRunAt: new Date(),
        lastRunStatus: "error",
        lastRunError: `${source.provider} doesn't support automated discovery — see the source's notes.`,
        updatedAt: new Date(),
      })
      .where(eq(atsWatchedSources.id, source.id));
    return { found: 0, created: 0 };
  }

  try {
    const listings = await adapter.fetchListings(source.boardToken);
    let designListings = listings.filter((listing) => matchesDesignRole(listing.title));

    if (source.discoveredViaSearchId) {
      const [search] = await db.select().from(savedSearches).where(eq(savedSearches.id, source.discoveredViaSearchId)).limit(1);
      if (search) {
        designListings = designListings.filter((listing) => matchesSearchCriteria(listing, search));
      }
    }

    let created = 0;
    for (const listing of designListings) {
      const exact = await findExactDuplicate(source.userId, listing.sourceName, listing.sourceJobId);
      if (exact) continue; // already imported — idempotent re-run

      const likely = await findLikelyDuplicate(source.userId, listing.company, listing.title);

      const [inserted] = await db
        .insert(jobs)
        .values({
          userId: source.userId,
          title: listing.title,
          company: source.label.split(" (")[0] || listing.company,
          jobUrl: listing.url,
          location: listing.location,
          description: listing.description || "(No description provided by the source — open the original posting.)",
          status: "discovered",
          sourceName: listing.sourceName,
          sourceJobId: listing.sourceJobId,
          sourceUrl: listing.url,
          normalizedCompany: normalizeForDedupe(source.label.split(" (")[0] || listing.company),
          normalizedTitle: normalizeForDedupe(listing.title),
          duplicateOfJobId: likely?.id ?? null,
          duplicateReviewed: false,
        })
        .returning();
      created += 1;

      // Best-effort analysis on import — a flaky Gemini call shouldn't block discovery for the rest of the batch.
      if (inserted && inserted.description.length > 40) {
        try {
          const { analysis, model, rawResponse } = await analyzeJobDescription(inserted.description);
          await db.insert(jobAnalyses).values({
            jobId: inserted.id,
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
        } catch {
          // Leave unanalyzed — the job page already offers "Re-analyze".
        }
      }
    }

    await db
      .update(atsWatchedSources)
      .set({
        lastRunAt: new Date(),
        lastRunStatus: "success",
        lastRunError: null,
        lastRunJobsFound: designListings.length,
        lastRunJobsNew: created,
        updatedAt: new Date(),
      })
      .where(eq(atsWatchedSources.id, source.id));

    return { found: designListings.length, created };
  } catch (error) {
    const message =
      error instanceof AtsFetchError ? error.message : error instanceof Error ? error.message : "Discovery failed.";
    await db
      .update(atsWatchedSources)
      .set({ lastRunAt: new Date(), lastRunStatus: "error", lastRunError: message, updatedAt: new Date() })
      .where(eq(atsWatchedSources.id, source.id));
    return { found: 0, created: 0 };
  }
}

export async function runDiscoveryNow(sourceId: string): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  const [source] = await db.select().from(atsWatchedSources).where(eq(atsWatchedSources.id, sourceId)).limit(1);
  if (!source || source.userId !== userId) return { error: "Watched source not found." };

  await runDiscoveryForSource(source);
  revalidatePath("/dashboard/discovery");
  revalidatePath("/dashboard/jobs");
}

/** Runs discovery across every enabled watched source for one user — used by the Vercel Cron route. */
export async function runDiscoveryForUser(userId: string): Promise<{ sourcesRun: number; jobsCreated: number }> {
  const sources = await db
    .select()
    .from(atsWatchedSources)
    .where(and(eq(atsWatchedSources.userId, userId), eq(atsWatchedSources.enabled, true)));

  let jobsCreated = 0;
  for (const source of sources) {
    const result = await runDiscoveryForSource(source);
    jobsCreated += result.created;
  }
  return { sourcesRun: sources.length, jobsCreated };
}

/** The user chose "view existing record" / "keep as separate role" / "dismiss" for a flagged duplicate. */
export async function resolveDuplicate(jobId: string, resolution: "keep_separate" | "dismiss"): Promise<void> {
  const userId = await requireUserId();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.userId !== userId) throw new Error("Job not found.");

  await db
    .update(jobs)
    .set({
      // "keep_separate": clear the flag entirely, this is confirmed to be its own role.
      // "dismiss": keep the link (so the relationship isn't lost) but stop surfacing it in the review queue.
      duplicateOfJobId: resolution === "keep_separate" ? null : job.duplicateOfJobId,
      duplicateReviewed: true,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));

  revalidatePath("/dashboard/discovery");
  revalidatePath("/dashboard/jobs");
}

export async function listWatchedSources(userId: string) {
  return db.select().from(atsWatchedSources).where(eq(atsWatchedSources.userId, userId)).orderBy(desc(atsWatchedSources.createdAt));
}

export async function listDuplicateQueue(userId: string) {
  const allJobs = await db.select().from(jobs).where(eq(jobs.userId, userId));
  return allJobs.filter((job) => job.duplicateOfJobId && !job.duplicateReviewed);
}
