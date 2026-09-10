import type { NormalizedListing } from "@/lib/ats/types";
import type { SavedSearch } from "@/lib/db/schema";

/**
 * Filters a normalized listing against a saved search's criteria.
 * Applied IN ADDITION TO the baseline matchesDesignRole() check (see
 * lib/ats/normalize.ts) for any board that was discovered via a saved
 * search — so a search never pulls in postings outside both its own
 * keywords and the general UX/Product Design scope.
 */
export function matchesSearchCriteria(
  listing: NormalizedListing,
  search: Pick<SavedSearch, "keywords" | "locationQuery" | "employmentType">
): boolean {
  const title = listing.title.toLowerCase();
  const keywordMatch =
    search.keywords.length === 0 || search.keywords.some((keyword) => title.includes(keyword.toLowerCase()));
  if (!keywordMatch) return false;

  if (search.locationQuery) {
    const location = (listing.location ?? "").toLowerCase();
    const description = listing.description.toLowerCase();
    const query = search.locationQuery.toLowerCase();
    const locationMatch =
      location.includes(query) || (query === "remote" && (location.includes("remote") || description.includes("remote")));
    if (!locationMatch) return false;
  }

  // Employment type is frequently missing from list-level ATS data, so it's treated as a
  // soft signal rather than a hard filter — a strict match here would silently drop
  // genuine results that just don't state it in the listing text.

  return true;
}
