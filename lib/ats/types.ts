/**
 * Source-adapter architecture for ATS job discovery. Each provider
 * implements `AtsAdapter` against its own API shape; every caller
 * (app/actions/ats.ts, app/api/cron/ats-refresh) works only against
 * this normalized interface, never against a provider's raw response.
 */

export type AtsProvider = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workday";

/** One job listing, normalized to the shape lib/ai and jobs.ts expect. */
export interface NormalizedListing {
  sourceName: AtsProvider;
  /** The posting's stable ID on its source ATS — the primary key for exact-duplicate detection. */
  sourceJobId: string;
  title: string;
  company: string;
  location: string | null;
  /** Plain text, HTML stripped — this becomes jobs.description, the input to Gemini analysis. */
  description: string;
  /** Canonical/apply URL on the source, when the API provides one. */
  url: string | null;
}

export class AtsFetchError extends Error {
  constructor(
    public readonly provider: AtsProvider,
    message: string
  ) {
    super(message);
    this.name = "AtsFetchError";
  }
}

export interface AtsAdapter {
  provider: AtsProvider;
  /**
   * False for providers with no stable, reliably-public unauthenticated
   * endpoint (Workday's CXS API varies per tenant and isn't officially
   * documented — see lib/ats/workday.ts). Callers must check this before
   * offering an automated refresh and show the manual-import fallback
   * instead.
   */
  supportsAutomatedFetch: boolean;
  /** boardToken is the provider-specific company/board identifier the user configured. */
  fetchListings(boardToken: string): Promise<NormalizedListing[]>;
}
