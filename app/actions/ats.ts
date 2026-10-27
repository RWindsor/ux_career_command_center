"use server";

import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { atsWatchedSources, jobs, savedSearches, type AtsWatchedSource, type DiscoveryRunStats, type Job } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/require-user";
import { ATS_ADAPTERS } from "@/lib/ats";
import { normalizeForDedupe } from "@/lib/ats/normalize";
import { isHiddenDiscoveryJob } from "@/lib/discovery/visibility";
import { applicableSearches, isSourceBlocked, planDiscovery, searchesMissingCountry, type SearchCriteria } from "@/lib/discovery/eligibility";
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

  const existing = await db.select().from(atsWatchedSources).where(eq(atsWatchedSources.userId, userId));
  if (existing.some((s) => s.provider === provider && s.boardToken.toLowerCase() === boardToken.toLowerCase())) {
    return { error: "That board is already in your watched list (it may be paused or excluded)." };
  }

  await db.insert(atsWatchedSources).values({
    userId,
    provider,
    boardToken,
    label: label || `${boardToken} (${provider})`,
  });

  revalidatePath("/discovery");
}

export async function deleteWatchedSource(sourceId: string): Promise<void> {
  const userId = await requireUserId();
  const [source] = await db.select().from(atsWatchedSources).where(eq(atsWatchedSources.id, sourceId)).limit(1);
  if (!source || source.userId !== userId) throw new Error("Watched source not found.");
  if (source.excluded) {
    // The row is what stops saved-search resolution from re-adding this board; keep it.
    throw new Error("Excluded sources are kept so they can't be re-added automatically. Remove the exclusion first if you really want to delete it.");
  }

  await db.delete(atsWatchedSources).where(eq(atsWatchedSources.id, sourceId));
  revalidatePath("/discovery");
}

export async function toggleWatchedSource(sourceId: string, enabled: boolean): Promise<void> {
  const userId = await requireUserId();
  const [source] = await db.select().from(atsWatchedSources).where(eq(atsWatchedSources.id, sourceId)).limit(1);
  if (!source || source.userId !== userId) throw new Error("Watched source not found.");

  await db.update(atsWatchedSources).set({ enabled, updatedAt: new Date() }).where(eq(atsWatchedSources.id, sourceId));
  revalidatePath("/discovery");
}

/** Loads the user's saved searches in the shape the eligibility gate needs. Disabled searches are included (and ignored by the gate) so counts can tell "none enabled" from "none cover this ATS". */
export async function loadSearchCriteria(userId: string): Promise<SearchCriteria[]> {
  const rows = await db.select().from(savedSearches).where(eq(savedSearches.userId, userId));
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    enabled: r.enabled,
    keywords: r.keywords,
    locationQuery: r.locationQuery,
    employmentType: r.employmentType,
    eligibleCountry: r.eligibleCountry,
    eligibleState: r.eligibleState,
    workArrangement: r.workArrangement,
    excludedTitleTerms: r.excludedTitleTerms ?? [],
    providers: r.providers,
  }));
}

async function analyzeAndStore(job: Pick<Job, "id" | "description">): Promise<void> {
  // Best-effort — a flaky Gemini call shouldn't block discovery for the rest of the batch.
  if (job.description.length <= 40) return;
  try {
    const { analysis, model, rawResponse } = await analyzeJobDescription(job.description);
    await db.insert(jobAnalyses).values({
      jobId: job.id,
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

/**
 * Runs discovery for one watched source: fetch → ELIGIBILITY GATE → normalize → deduplicate →
 * persist → (accepted only) analyze. Shared by "Run now" and the Vercel Cron route.
 *
 * Gate rules (lib/discovery/eligibility.ts):
 *  - Every auto-imported job — saved-search-discovered OR manually watched board — must satisfy
 *    every required condition of at least one ENABLED saved search that covers this ATS.
 *  - No enabled search => nothing is imported (fail closed). Deleting or pausing a search can
 *    therefore never leave a board importing unrestricted.
 *  - Rejected listings are never inserted and never sent to Gemini. Ambiguous ones are inserted
 *    as "needs_review" WITHOUT analysis until the user approves them.
 *
 * Safe to re-run: exact duplicates (same source + source job ID) are never re-inserted — that
 * includes archived and needs-review rows, so rejected/archived postings don't come back.
 */
export async function runDiscoveryForSource(
  source: AtsWatchedSource,
  preloadedSearches?: SearchCriteria[],
  maxNewJobs: number = Infinity
): Promise<{ found: number; created: number }> {
  const adapter = ATS_ADAPTERS[source.provider as AtsProvider];
  const now = () => new Date();

  const finish = (status: "success" | "skipped" | "error", error: string | null, stats: DiscoveryRunStats | null, found: number, created: number) =>
    db
      .update(atsWatchedSources)
      .set({
        lastRunAt: now(),
        lastRunStatus: status,
        lastRunError: error,
        lastRunJobsFound: found,
        lastRunJobsNew: created,
        lastRunStats: stats,
        updatedAt: now(),
      })
      .where(eq(atsWatchedSources.id, source.id));

  if (!adapter.supportsAutomatedFetch) {
    await finish("error", `${source.provider} doesn't support automated discovery — see the source's notes.`, null, 0, 0);
    return { found: 0, created: 0 };
  }

  // Gate 1: excluded source — skip without even fetching.
  if (isSourceBlocked(source)) {
    await finish("skipped", `Excluded source${source.exclusionReason ? `: ${source.exclusionReason}` : ""}. Nothing imported.`, { fetched: 0, accepted: 0, needsReview: 0, alreadyImported: 0, rejected: {}, review: {}, note: "excluded_source" }, 0, 0);
    return { found: 0, created: 0 };
  }

  // Gate 2: no enabled, provider-relevant saved search — skip without fetching (fail closed).
  const allSearches = preloadedSearches ?? (await loadSearchCriteria(source.userId));
  if (applicableSearches(allSearches, source.provider).length === 0) {
    const anyEnabled = allSearches.some((s) => s.enabled);
    await finish(
      "skipped",
      anyEnabled
        ? "No enabled saved search covers this ATS — nothing imported."
        : "No enabled saved search — nothing imported. Enable or create a saved search to resume imports.",
      { fetched: 0, accepted: 0, needsReview: 0, alreadyImported: 0, rejected: {}, review: {}, note: anyEnabled ? "no_search_for_provider" : "no_enabled_search" },
      0,
      0
    );
    return { found: 0, created: 0 };
  }

  // Gate 3 (staged rollout): every ENABLED search must say which country it is eligible for before anything imports.
  const missingCountry = searchesMissingCountry(allSearches);
  if (missingCountry.length > 0) {
    await finish(
      "skipped",
      `Imports paused: ${missingCountry.length} active saved search${missingCountry.length === 1 ? " has" : "es have"} no eligible country (${missingCountry.map((s) => s.label).slice(0, 3).join(", ")}). Set one under Discovery → Edit filters.`,
      { fetched: 0, accepted: 0, needsReview: 0, alreadyImported: 0, rejected: {}, review: {}, note: "search_missing_country" },
      0,
      0
    );
    return { found: 0, created: 0 };
  }

  try {
    const listings = await adapter.fetchListings(source.boardToken);
    const plan = planDiscovery(listings, source, allSearches);

    let created = 0;
    let alreadyImported = 0;
    const sourceLabel = source.label.split(" (")[0];

    const persist = async (item: (typeof plan.accepted)[number], state: "accepted" | "needs_review") => {
      const { listing, decision } = item;
      const exact = await findExactDuplicate(source.userId, listing.sourceName, listing.sourceJobId);
      if (exact) {
        alreadyImported += 1; // idempotent re-run — includes archived / needs-review rows
        return;
      }
      if (decision.decision === "reject") return;

      const likely = await findLikelyDuplicate(source.userId, listing.company, listing.title);
      const [inserted] = await db
        .insert(jobs)
        .values({
          userId: source.userId,
          title: listing.title,
          company: sourceLabel || listing.company,
          jobUrl: listing.url,
          location: listing.location,
          description: listing.description || "(No description provided by the source — open the original posting.)",
          status: "discovered",
          sourceName: listing.sourceName,
          sourceJobId: listing.sourceJobId,
          sourceUrl: listing.url,
          normalizedCompany: normalizeForDedupe(sourceLabel || listing.company),
          normalizedTitle: normalizeForDedupe(listing.title),
          duplicateOfJobId: likely?.id ?? null,
          duplicateReviewed: false,
          discoveryState: state,
          discoverySearchId: decision.searchId,
          discoveryReason: decision.reason,
          watchedSourceId: source.id,
        })
        .returning();
      created += 1;

      // AI analysis only AFTER the job qualified; needs-review jobs wait for approval.
      if (inserted && state === "accepted") await analyzeAndStore(inserted);
    };

    for (const item of plan.accepted) {
      if (created >= maxNewJobs) break;
      await persist(item, "accepted");
    }
    for (const item of plan.review) {
      if (created >= maxNewJobs) break;
      await persist(item, "needs_review");
    }

    const stats: DiscoveryRunStats = {
      fetched: listings.length,
      accepted: plan.accepted.length,
      needsReview: plan.review.length,
      alreadyImported,
      rejected: plan.rejectedCounts,
      review: plan.reviewCounts,
    };
    const found = plan.accepted.length + plan.review.length;
    await finish("success", null, stats, found, created);
    return { found, created };
  } catch (error) {
    const message =
      error instanceof AtsFetchError ? error.message : error instanceof Error ? error.message : "Discovery failed.";
    await finish("error", message, null, 0, 0);
    return { found: 0, created: 0 };
  }
}

/** Approve a Needs-review job: it becomes a normal accepted job and gets its AI analysis now. */
export async function approveReviewJob(jobId: string): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.userId !== userId) return { error: "Job not found." };
  if (job.discoveryState !== "needs_review") return { error: "This job isn't waiting for review." };

  await db
    .update(jobs)
    .set({ discoveryState: "accepted", discoveryReason: `Approved manually. ${job.discoveryReason ?? ""}`.trim(), updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
  await analyzeAndStore(job);

  revalidatePath("/discovery");
  revalidatePath("/jobs");
}

/** Reject a Needs-review job: archived (not deleted) so duplicate protection keeps it from coming back. */
export async function rejectReviewJob(jobId: string): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.userId !== userId) return { error: "Job not found." };
  if (job.discoveryState !== "needs_review") return { error: "This job isn't waiting for review." };

  await db
    .update(jobs)
    .set({ status: "archived", autoArchivedAt: new Date(), autoArchiveReason: "Rejected from Needs review", discoveryState: "accepted", updatedAt: new Date() })
    .where(eq(jobs.id, jobId));

  revalidatePath("/discovery");
  revalidatePath("/jobs");
}

/** Exclude (or un-exclude) a watched source — e.g. an aggregator board. The row is kept so resolution can't re-add it. */
export async function setSourceExclusion(sourceId: string, excluded: boolean, reason?: string): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  const [source] = await db.select().from(atsWatchedSources).where(eq(atsWatchedSources.id, sourceId)).limit(1);
  if (!source || source.userId !== userId) return { error: "Watched source not found." };

  await db
    .update(atsWatchedSources)
    .set({
      excluded,
      exclusionReason: excluded ? (reason?.trim() || source.exclusionReason || "Excluded by you") : null,
      exclusionOverride: excluded ? source.exclusionOverride : false,
      updatedAt: new Date(),
    })
    .where(eq(atsWatchedSources.id, sourceId));
  revalidatePath("/discovery");
}

/** Explicit "import from this excluded source anyway" switch. Jobs still have to pass the saved-search gate. */
export async function setSourceExclusionOverride(sourceId: string, override: boolean): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  const [source] = await db.select().from(atsWatchedSources).where(eq(atsWatchedSources.id, sourceId)).limit(1);
  if (!source || source.userId !== userId) return { error: "Watched source not found." };
  if (!source.excluded) return { error: "This source isn't excluded." };

  await db.update(atsWatchedSources).set({ exclusionOverride: override, updatedAt: new Date() }).where(eq(atsWatchedSources.id, sourceId));
  revalidatePath("/discovery");
}

export async function runDiscoveryNow(sourceId: string): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  const [source] = await db.select().from(atsWatchedSources).where(eq(atsWatchedSources.id, sourceId)).limit(1);
  if (!source || source.userId !== userId) return { error: "Watched source not found." };

  // Keep manual verification bounded; scheduled runs retain the normal full-board behavior.
  await runDiscoveryForSource(source, undefined, 10);
  revalidatePath("/discovery");
  revalidatePath("/jobs");
}

/** Runs discovery across every enabled watched source for one user — used by the Vercel Cron route. */
export async function runDiscoveryForUser(userId: string): Promise<{ sourcesRun: number; jobsCreated: number }> {
  const sources = await db
    .select()
    .from(atsWatchedSources)
    .where(and(eq(atsWatchedSources.userId, userId), eq(atsWatchedSources.enabled, true)));

  const searches = await loadSearchCriteria(userId);
  let jobsCreated = 0;
  for (const source of sources) {
    const result = await runDiscoveryForSource(source, searches);
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

  revalidatePath("/discovery");
  revalidatePath("/jobs");
}

export async function listWatchedSources(userId: string) {
  return db.select().from(atsWatchedSources).where(eq(atsWatchedSources.userId, userId)).orderBy(desc(atsWatchedSources.createdAt));
}

export async function listDuplicateQueue(userId: string) {
  const allJobs = await db.select().from(jobs).where(eq(jobs.userId, userId));
  return allJobs.filter((job) => job.duplicateOfJobId && !job.duplicateReviewed && !isHiddenDiscoveryJob(job));
}
