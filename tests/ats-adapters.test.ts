import test from "node:test";
import assert from "node:assert/strict";
import { smartrecruitersAdapter } from "../lib/ats/smartrecruiters";

test("SmartRecruiters preserves the public posting URL returned by job detail", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/postings?limit=100")) return Response.json({ content: [{ id: "123", name: "Senior UX Designer", location: { city: "Los Angeles", country: "us", hybrid: true }, typeOfEmployment: { label: "Contract" } }] });
    return Response.json({ postingUrl: "https://jobs.smartrecruiters.com/Example/123-senior-ux-designer", applyUrl: "https://jobs.smartrecruiters.com/Example/123-senior-ux-designer?oga=true", jobAd: { sections: { jobDescription: { text: "Hybrid contract role in Los Angeles." } } } });
  };
  try {
    const [job] = await smartrecruitersAdapter.fetchListings("Example");
    assert.equal(job.url, "https://jobs.smartrecruiters.com/Example/123-senior-ux-designer");
    assert.equal(job.employmentType, "Contract");
    assert.equal(job.workplaceType, "hybrid");
  } finally { globalThis.fetch = originalFetch; }
});
