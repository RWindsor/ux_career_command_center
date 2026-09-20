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
 * Brave Search API — a currently-supported, actively maintained full-web
 * search API with a straightforward single-header auth model. Chosen
 * after Google's Custom Search JSON API (the prior provider here) turned
 * out to be closed to new customers and returning 403 even with valid
 * credentials.
 * Docs: https://api-dashboard.search.brave.com/app/documentation/web-search/get-started
 *
 * This is the ONE piece of the discovery pipeline that costs money and
 * needs its own credentials — everything downstream (fetching a known
 * board, filtering, deduping, persisting, analyzing) is free and
 * unauthenticated. If BRAVE_SEARCH_API_KEY isn't set, `isConfigured()`
 * returns false and callers fall back to the documented manual
 * board-watching flow (see app/(dashboard)/discovery).
 */
export const braveSearchProvider: WebSearchProvider = {
  name: "Brave Search",
  isConfigured() {
    return Boolean(process.env.BRAVE_SEARCH_API_KEY);
  },
  async search(query: string): Promise<WebSearchResult[]> {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      throw new Error("BRAVE_SEARCH_API_KEY is not set.");
    }

    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Brave Search returned ${res.status}. ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      web?: { results?: { title?: string; url?: string; description?: string }[] };
    };

    return (data.web?.results ?? [])
      .filter((item): item is { title?: string; url: string; description?: string } => Boolean(item.url))
      .map((item) => ({ title: item.title ?? item.url, url: item.url, snippet: item.description ?? "" }));
  },
};

/**
 * Small registry so a different full-web search provider can be swapped
 * in later without touching board-resolver.ts or any UI — add an entry
 * here and point SEARCH_PROVIDER at its key. Only Brave is implemented
 * today.
 */
const SEARCH_PROVIDERS: Record<string, WebSearchProvider> = {
  brave: braveSearchProvider,
};

function resolveConfiguredProvider(): WebSearchProvider {
  const key = (process.env.SEARCH_PROVIDER || "brave").trim().toLowerCase();
  return SEARCH_PROVIDERS[key] ?? braveSearchProvider;
}

/**
 * The provider the resolver actually uses — resolved from SEARCH_PROVIDER
 * (default "brave") on every call, so an env var change takes effect
 * without any code change.
 */
export const webSearchProvider: WebSearchProvider = {
  get name() {
    return resolveConfiguredProvider().name;
  },
  isConfigured() {
    return resolveConfiguredProvider().isConfigured();
  },
  search(query: string) {
    return resolveConfiguredProvider().search(query);
  },
};
