"use server";

import { revalidatePath } from "next/cache";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedSearches, atsWatchedSources, type SavedSearch } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/require-user";
import { resolveBoardsForSearch } from "@/lib/discovery/board-resolver";
import { runDiscoveryForSource } from "@/app/actions/ats";
import type { AtsProvider } from "@/lib/ats/types";
import { ATS_PROVIDER_LABELS } from "@/lib/ats";

const RESOLVABLE_PROVIDERS: AtsProvider[] = ["greenhouse", "lever", "ashby", "smartrecruiters"];

export async function createSavedSearch(_prevState: unknown, formData: FormData): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const label = String(formData.get("label") ?? "").trim();
  const keywordsRaw = String(formData.get("keywords") ?? "").trim();
  const locationQuery = String(formData.get("locationQuery") ?? "").trim();
  const employmentType = String(formData.get("employmentType") ?? "").trim();
  const providers = formData.getAll("providers").map(String) as AtsProvider[];

  const keywords = keywordsRaw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (keywords.length === 0) {
    return { error: "Add at least one title/keyword to search for (comma-separated)." };
  }
  const validProviders = providers.filter((p) => RESOLVABLE_PROVIDERS.includes(p));
  if (validProviders.length === 0) {
    return { error: "Choose at least one ATS ecosystem to search." };
  }

  const [search] = await db
    .insert(savedSearches)
    .values({
      userId,
      label: label || keywords.join(", "),
      keywords,
      locationQuery: locationQuery || null,
      employmentType: employmentType || null,
      providers: validProviders,
    })
    .returning();

  revalidatePath("/dashboard/discovery");

  // Resolve immediately so the user sees results without waiting for the nightly cron.
  await resolveSavedSearchInternal(search);
  revalidatePath("/dashboard/discovery");
  revalidatePath("/dashboard/jobs");
}

export async function deleteSavedSearch(searchId: string): Promise<void> {
  const userId = await requireUserId();
  const [search] = await db.select().from(savedSearches).where(eq(savedSearches.id, searchId)).limit(1);
  if (!search || search.userId !== userId) throw new Error("Saved search not found.");

  await db.delete(savedSearches).where(eq(savedSearches.id, searchId));
  // Boards this search discovered are left in place (they may still be useful, and
  // deleting a search should never silently delete job history) — the user can remove
  // an individual board from the watched-boards list if they no longer want it.
  revalidatePath("/dashboard/discovery");
}

export async function toggleSavedSearch(searchId: string, enabled: boolean): Promise<void> {
  const userId = await requireUserId();
  const [search] = await db.select().from(savedSearches).where(eq(savedSearches.id, searchId)).limit(1);
  if (!search || search.userId !== userId) throw new Error("Saved search not found.");

  await db.update(savedSearches).set({ enabled, updatedAt: new Date() }).where(eq(savedSearches.id, searchId));
  revalidatePath("/dashboard/discovery");
}

/**
 * Core resolve logic — (1) finds candidate boards for this search's
 * criteria via the web-search provider, (2) upserts them into
 * atsWatchedSources (skipping ones already watched), (3) immediately
 * runs the normal fetch/normalize/dedupe/persist/analyze pipeline on
 * any newly-added board. Shared by the user-triggered action below and
 * the Vercel Cron route (app/api/cron/discovery-resolve).
 */
export async function resolveSavedSearchInternal(search: SavedSearch): Promise<{ error: string } | { boardsFound: number; boardsNew: number }> {
  try {
    const { candidates, unsupportedProviders } = await resolveBoardsForSearch({
      keywords: search.keywords,
      locationQuery: search.locationQuery,
      providers: search.providers as AtsProvider[],
    });

    const existing = await db.select().from(atsWatchedSources).where(eq(atsWatchedSources.userId, search.userId));
    const existingKeys = new Set(existing.map((s) => `${s.provider}:${s.boardToken.toLowerCase()}`));

    let boardsNew = 0;
    for (const candidate of candidates) {
      const key = `${candidate.provider}:${candidate.boardToken.toLowerCase()}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      const [newSource] = await db
        .insert(atsWatchedSources)
        .values({
          userId: search.userId,
          provider: candidate.provider,
          boardToken: candidate.boardToken,
          label: `${candidate.titleHint.slice(0, 60)} (${ATS_PROVIDER_LABELS[candidate.provider]})`,
          discoveredViaSearchId: search.id,
          autoDiscovered: true,
        })
        .returning();
      boardsNew += 1;

      if (newSource) await runDiscoveryForSource(newSource);
    }

    const statusNote =
      unsupportedProviders.length > 0
        ? `success (note: ${unsupportedProviders.join(", ")} has no resolvable public board-listing pattern yet)`
        : "success";

    await db
      .update(savedSearches)
      .set({
        lastResolvedAt: new Date(),
        lastResolvedStatus: statusNote,
        lastResolvedError: null,
        lastResolvedBoardsFound: candidates.length,
        updatedAt: new Date(),
      })
      .where(eq(savedSearches.id, search.id));

    return { boardsFound: candidates.length, boardsNew };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resolving this search failed.";
    await db
      .update(savedSearches)
      .set({ lastResolvedAt: new Date(), lastResolvedStatus: "error", lastResolvedError: message, updatedAt: new Date() })
      .where(eq(savedSearches.id, search.id));
    return { error: message };
  }
}

export async function resolveSavedSearchNow(searchId: string): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  const [search] = await db.select().from(savedSearches).where(eq(savedSearches.id, searchId)).limit(1);
  if (!search || search.userId !== userId) return { error: "Saved search not found." };

  const result = await resolveSavedSearchInternal(search);
  revalidatePath("/dashboard/discovery");
  revalidatePath("/dashboard/jobs");
  if ("error" in result) return { error: result.error };
}

/** Used by the Vercel Cron route to re-resolve every enabled saved search for every user. */
export async function resolveAllSavedSearches(): Promise<{ searchesRun: number; boardsNew: number }> {
  const searches = await db.select().from(savedSearches).where(eq(savedSearches.enabled, true));

  let boardsNew = 0;
  for (const search of searches) {
    const result = await resolveSavedSearchInternal(search);
    if (!("error" in result)) boardsNew += result.boardsNew;
  }
  return { searchesRun: searches.length, boardsNew };
}

export async function listSavedSearches(userId: string) {
  return db.select().from(savedSearches).where(eq(savedSearches.userId, userId)).orderBy(desc(savedSearches.createdAt));
}
