import type { AtsAdapter, NormalizedListing } from "@/lib/ats/types";

/**
 * Workday has no stable, officially-documented public API for reading a
 * tenant's job board. Each tenant exposes an internal "CXS" JSON
 * endpoint at a URL pattern that varies by tenant configuration and can
 * change without notice — scraping it would be exactly the kind of
 * brittle, access-rule-risking integration the product brief says to
 * avoid.
 *
 * So this adapter is a deliberate, honest no-op: `supportsAutomatedFetch`
 * is false, the UI never offers an automated refresh for a Workday
 * source, and `fetchListings` always fails loudly rather than pretending
 * to work. The fallback is the existing manual/URL-paste job entry flow
 * (app/(dashboard)/jobs/new) — the user pastes the posting text, which
 * already gets full Gemini analysis like any other job.
 */
export const workdayAdapter: AtsAdapter = {
  provider: "workday",
  supportsAutomatedFetch: false,
  async fetchListings(_boardToken: string): Promise<NormalizedListing[]> {
    throw new Error(
      "Workday doesn't have a stable public API to poll, so automated discovery isn't supported for it. Use “Add job” and paste the posting instead — it gets the same Gemini analysis."
    );
  },
};
