import { AtsFetchError, type AtsAdapter, type NormalizedListing } from "@/lib/ats/types";
import { stripHtml } from "@/lib/ats/normalize";

/**
 * Lever's public postings API — no auth required. `boardToken` is the
 * company slug in a Lever job board URL, e.g. https://jobs.lever.co/{boardToken}.
 * Docs: https://github.com/lever/postings-api
 */
export const leverAdapter: AtsAdapter = {
  provider: "lever",
  supportsAutomatedFetch: true,
  async fetchListings(boardToken: string): Promise<NormalizedListing[]> {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(boardToken)}?mode=json`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) {
      throw new AtsFetchError(
        "lever",
        `Lever board "${boardToken}" returned ${res.status}. Check the board token — it's the slug in jobs.lever.co/<token>.`
      );
    }

    const data = (await res.json()) as {
      id: string;
      text: string;
      categories?: { location?: string; team?: string; commitment?: string };
      descriptionPlain?: string;
      description?: string;
      lists?: { text: string; content: string }[];
      hostedUrl?: string;
      applyUrl?: string;
    }[];

    if (!Array.isArray(data)) {
      throw new AtsFetchError("lever", "Unexpected response shape from Lever.");
    }

    return data.map((posting) => {
      const extraSections = (posting.lists ?? [])
        .map((section) => `${section.text}\n${stripHtml(section.content)}`)
        .join("\n\n");
      const description = [
        posting.descriptionPlain ?? (posting.description ? stripHtml(posting.description) : ""),
        extraSections,
      ]
        .filter(Boolean)
        .join("\n\n");

      return {
        sourceName: "lever" as const,
        sourceJobId: posting.id,
        title: posting.text,
        company: boardToken,
        location: posting.categories?.location ?? null,
        description,
        url: posting.hostedUrl ?? posting.applyUrl ?? null,
      };
    });
  },
};
