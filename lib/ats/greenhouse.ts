import { AtsFetchError, type AtsAdapter, type NormalizedListing } from "@/lib/ats/types";
import { stripHtml } from "@/lib/ats/normalize";

/**
 * Greenhouse's public Job Board API — no auth required, one JSON
 * request per board. `boardToken` is the slug in a company's Greenhouse
 * board URL, e.g. https://boards.greenhouse.io/{boardToken}.
 * Docs: https://developers.greenhouse.io/job-board.html
 */
export const greenhouseAdapter: AtsAdapter = {
  provider: "greenhouse",
  supportsAutomatedFetch: true,
  async fetchListings(boardToken: string): Promise<NormalizedListing[]> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) {
      throw new AtsFetchError(
        "greenhouse",
        `Greenhouse board "${boardToken}" returned ${res.status}. Check the board token — it's the slug in boards.greenhouse.io/<token>.`
      );
    }

    const data = (await res.json()) as {
      jobs?: {
        id: number | string;
        title: string;
        location?: { name?: string };
        content?: string;
        absolute_url?: string;
      }[];
    };

    if (!Array.isArray(data.jobs)) {
      throw new AtsFetchError("greenhouse", "Unexpected response shape from Greenhouse.");
    }

    return data.jobs.map((job) => ({
      sourceName: "greenhouse",
      sourceJobId: String(job.id),
      title: job.title,
      company: boardToken,
      location: job.location?.name ?? null,
      description: job.content ? stripHtml(job.content) : "",
      url: job.absolute_url ?? null,
    }));
  },
};
