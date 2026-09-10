/**
 * Pluggable web-search abstraction used only for board discovery (see
 * board-resolver.ts). Kept separate from the ATS adapters in lib/ats/ —
 * this never touches job data directly, it only turns search keywords
 * into candidate company career-page URLs.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchProvider {
  name: string;
  isConfigured(): boolean;
  search(query: string): Promise<WebSearchResult[]>;
}

/**
 * Google Programmable Search Engine (Custom Search JSON API) — a
 * stable, documented Google product built for exactly this kind of
 * site-scoped search. Requires a Search Engine configured to search
 * the whole web (or at least the ATS hosting domains) plus an API key.
 * Docs: https://developers.google.com/custom-search/v1/overview
 *
 * This is the ONE piece of the discovery pipeline that costs money and
 * needs its own credentials — everything downstream (fetching a known
 * board, filtering, deduping, persisting, analyzing) is free and
 * unauthenticated. If these env vars aren't set, `isConfigured()`
 * returns false and callers fall back to the documented manual
 * board-watching flow (see app/(dashboard)/discovery).
 */
export const googleCseProvider: WebSearchProvider = {
  name: "Google Programmable Search",
  isConfigured() {
    return Boolean(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID);
  },
  async search(query: string): Promise<WebSearchResult[]> {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;
    if (!apiKey || !cx) {
      throw new Error("GOOGLE_SEARCH_API_KEY / GOOGLE_SEARCH_ENGINE_ID are not set.");
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&num=10&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Programmable Search returned ${res.status}. ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      items?: { title?: string; link?: string; snippet?: string }[];
    };

    return (data.items ?? [])
      .filter((item): item is { title: string; link: string; snippet?: string } => Boolean(item.link))
      .map((item) => ({ title: item.title ?? item.link, url: item.link, snippet: item.snippet ?? "" }));
  },
};

/** The provider the resolver uses. Swap here if you'd rather wire up Bing or another provider. */
export const webSearchProvider: WebSearchProvider = googleCseProvider;
