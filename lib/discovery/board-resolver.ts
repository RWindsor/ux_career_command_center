import { webSearchProvider } from "@/lib/discovery/search-provider";
import type { AtsProvider } from "@/lib/ats/types";

/**
 * Per-provider "board URL" hosting pattern, used to (a) scope the web
 * search to that ATS's job-board domain and (b) extract the board
 * token from a matching result URL. Workday is deliberately excluded —
 * see lib/ats/workday.ts for why automated fetch isn't offered for it
 * even if a Workday careers page turns up in search results.
 */
const BOARD_URL_PATTERNS: Partial<Record<AtsProvider, { host: string; tokenPattern: RegExp }>> = {
  greenhouse: { host: "boards.greenhouse.io", tokenPattern: /boards\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-zA-Z0-9_-]+)/i },
  lever: { host: "jobs.lever.co", tokenPattern: /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/i },
  ashby: { host: "jobs.ashbyhq.com", tokenPattern: /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/i },
  // SmartRecruiters' public careers pages use the same slug as the Postings API's
  // company identifier in the common case, but this isn't guaranteed by any
  // documented contract — treated as best-effort, see the caller's warning.
  smartrecruiters: { host: "jobs.smartrecruiters.com", tokenPattern: /jobs\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/i },
};

export interface ResolvedBoardCandidate {
  provider: AtsProvider;
  boardToken: string;
  sourceUrl: string;
  titleHint: string;
}

/**
 * Resolves candidate ATS boards for one saved search by running a
 * site-scoped web search per requested provider and extracting board
 * tokens from the URLs that come back. This is a best-effort discovery
 * step, not a guarantee of completeness — a company's board simply
 * won't surface here if it isn't indexed by the search provider, or if
 * its careers page doesn't link directly to the ATS-hosted board URL.
 *
 * Throws if the web-search provider isn't configured — callers (see
 * app/actions/saved-searches.ts) surface that as a clear setup-required
 * state rather than silently returning nothing.
 */
export async function resolveBoardsForSearch(search: {
  keywords: string[];
  locationQuery: string | null;
  providers: AtsProvider[];
}): Promise<{ candidates: ResolvedBoardCandidate[]; unsupportedProviders: AtsProvider[] }> {
  if (!webSearchProvider.isConfigured()) {
    throw new Error(
      `Search-driven discovery needs a web-search API configured (${webSearchProvider.name} — set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID). Until then, add specific boards manually below.`
    );
  }

  const unsupportedProviders = search.providers.filter((p) => !BOARD_URL_PATTERNS[p]);
  const supportedProviders = search.providers.filter((p): p is keyof typeof BOARD_URL_PATTERNS => Boolean(BOARD_URL_PATTERNS[p]));

  const keywordPhrase = search.keywords.join(" OR ");
  const candidates: ResolvedBoardCandidate[] = [];
  const seen = new Set<string>();

  for (const provider of supportedProviders) {
    const pattern = BOARD_URL_PATTERNS[provider]!;
    const query = `site:${pattern.host} ${keywordPhrase}${search.locationQuery ? ` ${search.locationQuery}` : ""}`;

    const results = await webSearchProvider.search(query);
    for (const result of results) {
      const match = result.url.match(pattern.tokenPattern);
      if (!match) continue;
      const boardToken = match[1];
      const dedupeKey = `${provider}:${boardToken}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      candidates.push({ provider, boardToken, sourceUrl: result.url, titleHint: result.title });
    }
  }

  return { candidates, unsupportedProviders };
}
