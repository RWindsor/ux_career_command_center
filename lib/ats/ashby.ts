import { AtsFetchError, type AtsAdapter, type NormalizedListing } from "@/lib/ats/types";
import { stripHtml } from "@/lib/ats/normalize";

/**
 * Ashby's public Job Board API — no auth required. `boardToken` is the
 * job-board name in a company's Ashby careers URL, e.g.
 * https://jobs.ashbyhq.com/{boardToken}.
 * Docs: https://developers.ashbyhq.com/reference/job-board-api
 *
 * NOTE: this adapter is written against Ashby's documented public
 * response shape but has not been exercised against a live board from
 * this environment (no network egress to ashbyhq.com here). Verify
 * against a real board token after deploying — see the FINAL HANDOFF.
 */
export const ashbyAdapter: AtsAdapter = {
  provider: "ashby",
  supportsAutomatedFetch: true,
  async fetchListings(boardToken: string): Promise<NormalizedListing[]> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardToken)}?includeCompensation=false`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) {
      throw new AtsFetchError(
        "ashby",
        `Ashby board "${boardToken}" returned ${res.status}. Check the board token — it's the slug in jobs.ashbyhq.com/<token>.`
      );
    }

    const data = (await res.json()) as {
      jobs?: {
        id: string;
        title: string;
        location?: string;
        descriptionPlain?: string;
        descriptionHtml?: string;
        jobUrl?: string;
        applyUrl?: string;
      }[];
    };

    if (!Array.isArray(data.jobs)) {
      throw new AtsFetchError("ashby", "Unexpected response shape from Ashby.");
    }

    return data.jobs.map((job) => ({
      sourceName: "ashby",
      sourceJobId: job.id,
      title: job.title,
      company: boardToken,
      location: job.location ?? null,
      description: job.descriptionPlain ?? (job.descriptionHtml ? stripHtml(job.descriptionHtml) : ""),
      url: job.jobUrl ?? job.applyUrl ?? null,
    }));
  },
};
