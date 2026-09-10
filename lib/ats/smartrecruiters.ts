import { AtsFetchError, type AtsAdapter, type NormalizedListing } from "@/lib/ats/types";
import { stripHtml } from "@/lib/ats/normalize";
import { matchesDesignRole } from "@/lib/ats/normalize";

/**
 * SmartRecruiters' public Posting API — no auth required.
 * `boardToken` is the company identifier used in
 * api.smartrecruiters.com/v1/companies/{boardToken}/postings.
 * Docs: https://developers.smartrecruiters.com/docs/postings-api
 *
 * The list endpoint doesn't include the full job ad body, so this
 * adapter does a second detail fetch per posting — but only for
 * postings whose title already looks like a UX/Product Design role,
 * to avoid an unbounded number of requests per refresh.
 *
 * NOTE: written against SmartRecruiters' documented response shape but
 * not exercised against a live company from this environment (no
 * network egress to smartrecruiters.com here). Verify after deploying.
 */
export const smartrecruitersAdapter: AtsAdapter = {
  provider: "smartrecruiters",
  supportsAutomatedFetch: true,
  async fetchListings(boardToken: string): Promise<NormalizedListing[]> {
    const listUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(boardToken)}/postings?limit=100`;
    const listRes = await fetch(listUrl, { headers: { Accept: "application/json" } });

    if (!listRes.ok) {
      throw new AtsFetchError(
        "smartrecruiters",
        `SmartRecruiters company "${boardToken}" returned ${listRes.status}. Check the company identifier.`
      );
    }

    const listData = (await listRes.json()) as {
      content?: {
        id: string;
        name: string;
        location?: { city?: string; region?: string; country?: string };
        applyUrl?: string;
        ref?: string;
      }[];
    };

    if (!Array.isArray(listData.content)) {
      throw new AtsFetchError("smartrecruiters", "Unexpected response shape from SmartRecruiters.");
    }

    const candidates = listData.content.filter((posting) => matchesDesignRole(posting.name));

    const detailed = await Promise.all(
      candidates.map(async (posting) => {
        const location = [posting.location?.city, posting.location?.region, posting.location?.country]
          .filter(Boolean)
          .join(", ");

        let description = "";
        try {
          const detailUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(boardToken)}/postings/${encodeURIComponent(posting.id)}`;
          const detailRes = await fetch(detailUrl, { headers: { Accept: "application/json" } });
          if (detailRes.ok) {
            const detail = (await detailRes.json()) as {
              jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
            };
            const sections = detail.jobAd?.sections ?? {};
            description = Object.values(sections)
              .map((section) => `${section.title ?? ""}\n${section.text ? stripHtml(section.text) : ""}`)
              .join("\n\n")
              .trim();
          }
        } catch {
          // Detail fetch failing shouldn't drop the listing — fall back to title/location only,
          // the user can still see it and open the original posting via `url`.
        }

        const listing: NormalizedListing = {
          sourceName: "smartrecruiters",
          sourceJobId: posting.id,
          title: posting.name,
          company: boardToken,
          location: location || null,
          description: description || `(Full description unavailable — view the original posting for details.)`,
          url: posting.applyUrl ?? null,
        };
        return listing;
      })
    );

    return detailed;
  },
};
