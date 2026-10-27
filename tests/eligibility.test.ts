import test from "node:test";
import assert from "node:assert/strict";
import type { NormalizedListing } from "../lib/ats/types";
import { applicableSearches, evaluateListing, planDiscovery, REJECT_LABELS, REVIEW_LABELS, type SearchCriteria } from "../lib/discovery/eligibility";
import { discoveryCronEnabled } from "../lib/discovery/rollout";
import { classifyStoredJob, boardTokenFromUrl, type StoredJob } from "../lib/discovery/cleanup";

const usRemote: SearchCriteria = {
  id: "s-us", label: "Senior Product Designer – US remote", enabled: true,
  keywords: ["Product Designer", "UX Designer"], locationQuery: null, employmentType: "Full-time",
  eligibleCountry: "US", workArrangement: "remote", excludedTitleTerms: ["Intern", "Director"], providers: ["greenhouse", "lever", "ashby", "smartrecruiters"],
};

function listing(over: Partial<NormalizedListing> = {}): NormalizedListing {
  return {
    sourceName: "greenhouse", sourceJobId: String(Math.random()), title: "Senior Product Designer", company: "acme",
    location: "Remote - US", description: "This is a full-time role. Fully remote.", url: "https://boards.greenhouse.io/acme/jobs/1", ...over,
  };
}
const source = { provider: "greenhouse" };

test("US remote passes (and records which search + why)", () => {
  const d = evaluateListing(listing(), [usRemote]);
  assert.equal(d.decision, "accept");
  assert.ok(d.decision === "accept" && d.searchId === "s-us" && d.reason.includes("Senior Product Designer – US remote") && d.reason.includes("US"));
});

test("'Remote' alone does NOT satisfy a US-only search (needs review, with a geography reason)", () => {
  const d = evaluateListing(listing({ location: "Remote", description: "Join our team. Full-time. Fully remote." }), [usRemote]);
  assert.equal(d.decision, "review");
  assert.ok(d.decision === "review" && d.codes.includes("geography_ambiguous"));
});

test("international-only remote fails", () => {
  for (const location of ["Remote - Canada", "Remote, EMEA", "Remote - Germany", "London, UK", "Remote (Europe)"]) {
    const d = evaluateListing(listing({ location }), [usRemote]);
    assert.equal(d.decision, "reject", location);
    assert.ok(d.decision === "reject" && d.code === "country_not_eligible", location);
  }
});

test("structured ATS country codes beat text", () => {
  assert.equal(evaluateListing(listing({ location: "Remote", countryCodes: ["US"] }), [usRemote]).decision, "accept");
  assert.equal(evaluateListing(listing({ location: "Remote - US", countryCodes: ["CA"] }), [usRemote]).decision, "reject");
});

test("ambiguous remote goes to review: worldwide / Americas / empty / city-less", () => {
  for (const location of ["Worldwide", "Remote - Americas", "Anywhere", "", null]) {
    const d = evaluateListing(listing({ location, description: "Full-time. Fully remote role." }), [usRemote]);
    assert.equal(d.decision, "review", String(location));
  }
});

test("description can resolve a bare 'Remote' only with an explicit statement", () => {
  const pass = evaluateListing(listing({ location: "Remote", description: "Full-time. You must be located in the United States. Fully remote." }), [usRemote]);
  assert.equal(pass.decision, "accept");
  const fail = evaluateListing(listing({ location: "Remote", description: "Full-time. Candidates must be based in Germany. Fully remote." }), [usRemote]);
  assert.equal(fail.decision, "reject");
});

test("excluded title terms fail (whole word, case-insensitive; 'International' is not 'Intern')", () => {
  assert.equal(evaluateListing(listing({ title: "Product Design Intern" }), [usRemote]).decision, "reject");
  assert.equal(evaluateListing(listing({ title: "Director, Product Designer" }), [usRemote]).decision, "reject");
  assert.equal(evaluateListing(listing({ title: "International Product Designer" }), [usRemote]).decision, "accept");
});

test("explicit employment-type mismatch fails; missing goes to review", () => {
  const contractTitle = evaluateListing(listing({ title: "Product Designer (Contract)" }), [usRemote]);
  assert.ok(contractTitle.decision === "reject" && contractTitle.code === "employment_type_mismatch");
  const structured = evaluateListing(listing({ employmentType: "PartTime" }), [usRemote]);
  assert.ok(structured.decision === "reject" && structured.code === "employment_type_mismatch");
  const missing = evaluateListing(listing({ description: "Design great things. Fully remote." }), [usRemote]);
  assert.ok(missing.decision === "review" && missing.codes.includes("employment_type_unknown"));
});

test("work-arrangement mismatch fails; missing arrangement goes to review", () => {
  const hybrid = evaluateListing(listing({ location: "New York, NY (Hybrid)" }), [usRemote]);
  assert.ok(hybrid.decision === "reject" && hybrid.code === "arrangement_mismatch");
  const unknown = evaluateListing(listing({ location: "New York, NY", description: "Full-time role at our NYC studio." }), [usRemote]);
  assert.ok(unknown.decision === "review" && unknown.codes.includes("arrangement_unknown"));
});

test("a job qualifies if it meets EVERY condition of AT LEAST ONE enabled search (OR across searches)", () => {
  const hybridNyc: SearchCriteria = { ...usRemote, id: "s-nyc", label: "NYC hybrid", workArrangement: "hybrid", excludedTitleTerms: [] };
  const d = evaluateListing(listing({ location: "New York, NY (Hybrid)" }), [usRemote, hybridNyc]);
  assert.ok(d.decision === "accept" && d.searchId === "s-nyc");
  // a failing condition in one search is not rescued by another search's different rules
  const d2 = evaluateListing(listing({ title: "Product Design Intern" }), [usRemote]);
  assert.equal(d2.decision, "reject");
});

test("legacy search (no new fields, locationQuery 'Remote') now treats Remote as ARRANGEMENT only", () => {
  const legacy: SearchCriteria = { ...usRemote, id: "legacy", label: "legacy", eligibleCountry: null, workArrangement: null, excludedTitleTerms: [], locationQuery: "Remote", employmentType: null };
  assert.equal(evaluateListing(listing({ location: "Remote - Germany" }), [legacy]).decision, "accept"); // no country set => no geography rule (UI warns)
  assert.equal(evaluateListing(listing({ location: "Austin, TX", description: "A role at our studio." }), [legacy]).decision, "review");
});

test("disabled / deleted searches cannot keep importing (fail closed)", () => {
  const disabled = { ...usRemote, enabled: false };
  assert.deepEqual(applicableSearches([disabled], "greenhouse"), []);

  const ls = [listing(), listing({ sourceJobId: "2", title: "UX Designer" })];
  // disabled
  const p1 = planDiscovery(ls, source, [disabled]);
  assert.equal(p1.accepted.length + p1.review.length, 0);
  assert.equal(p1.rejectedCounts.no_enabled_search, 2);
  // deleted (no searches at all) — and a manually watched board is gated the same way
  const p2 = planDiscovery(ls, { provider: "greenhouse" }, []);
  assert.equal(p2.accepted.length + p2.review.length, 0);
  assert.equal(p2.rejectedCounts.no_enabled_search, 2);
  // enabled search exists but doesn't cover this ATS
  const lever = { ...usRemote, providers: ["lever"] };
  const p3 = planDiscovery(ls, source, [lever]);
  assert.equal(p3.rejectedCounts.no_search_for_provider, 2);
});

test("manually watched boards are gated by enabled searches too (not only search-discovered ones)", () => {
  const p = planDiscovery([listing({ location: "Remote - Canada" })], { provider: "greenhouse" }, [usRemote]);
  assert.equal(p.rejectedCounts.country_not_eligible, 1);
});

test("excluded source is skipped unless explicitly overridden; aggregator URLs are rejected", () => {
  const blocked = planDiscovery([listing()], { provider: "ashby", excluded: true }, [usRemote]);
  assert.equal(blocked.rejectedCounts.excluded_source, 1);
  const overridden = planDiscovery([listing({ sourceName: "ashby" })], { provider: "ashby", excluded: true, exclusionOverride: true }, [usRemote]);
  assert.equal(overridden.accepted.length, 1);
  const agg = planDiscovery([listing({ url: "https://jobgether.com/offer/abc123" })], source, [usRemote]);
  assert.equal(agg.rejectedCounts.aggregator_url, 1);
});

test("non-design titles are rejected before any search logic", () => {
  const p = planDiscovery([listing({ title: "Staff Accountant" })], source, [usRemote]);
  assert.equal(p.rejectedCounts.not_design_role, 1);
});

test("rejection counts by reason across a mixed batch", () => {
  const batch = [
    listing({ sourceJobId: "a" }),                                                   // accept
    listing({ sourceJobId: "b", location: "Remote - Canada" }),                      // reject country
    listing({ sourceJobId: "c", location: "Remote - UK" }),                          // reject country
    listing({ sourceJobId: "d", location: "Remote", description: "Full-time. Fully remote." }), // review geography
    listing({ sourceJobId: "e", title: "Product Designer Intern" }),                        // reject excluded title
    listing({ sourceJobId: "f", title: "Product Designer - Contract" }),             // reject employment
    listing({ sourceJobId: "g", location: "Chicago, IL (Hybrid)" }),                 // reject arrangement
    listing({ sourceJobId: "h", description: "Design things. Remote." }),            // review employment
    listing({ sourceJobId: "i", title: "Staff Accountant" }),                        // reject not design
    listing({ sourceJobId: "j", url: "https://jobgether.com/o/1" }),                 // reject aggregator
  ];
  const p = planDiscovery(batch, source, [usRemote]);
  console.log("\n  accepted:", p.accepted.length, "| needs review:", p.review.length, "| rejected:", p.rejected.length);
  for (const [k, n] of Object.entries(p.rejectedCounts)) console.log(`  rejected  ${String(n).padStart(2)}  ${REJECT_LABELS[k] ?? k}`);
  for (const [k, n] of Object.entries(p.reviewCounts)) console.log(`  to review ${String(n).padStart(2)}  ${REVIEW_LABELS[k] ?? k}`);
  assert.deepEqual(p.rejectedCounts, { country_not_eligible: 2, excluded_title_term: 1, employment_type_mismatch: 1, arrangement_mismatch: 1, not_design_role: 1, aggregator_url: 1 });
  assert.deepEqual(p.reviewCounts, { geography_ambiguous: 1, employment_type_unknown: 1 });
  assert.equal(p.accepted.length, 1);
});

/* ------------------------- cleanup classifier ------------------------- */

const t0 = new Date("2026-09-01T00:00:00Z");
function stored(over: Partial<StoredJob> = {}): StoredJob {
  return {
    id: "j1", title: "Product Designer", company: "Acme", location: "Remote - Canada", description: "Full-time.", sourceName: "greenhouse",
    sourceJobId: "1", jobUrl: "https://boards.greenhouse.io/acme/jobs/1", sourceUrl: null, status: "discovered", notes: null, offerCompensation: null,
    duplicateReviewed: false, discoveryState: null, autoArchivedAt: null, createdAt: t0, updatedAt: t0, ...over,
  };
}
const none = { matches: 0, applicationPackages: 0, interviewPreps: 0, offerPreps: 0 };
const ctx = { searches: [usRemote], source: null };

test("cleanup: untouched auto-discovered non-qualifying job would be archived", () => {
  assert.equal(classifyStoredJob(stored(), none, ctx).bucket, "archive");
});

test("cleanup: manual entries, notes, saved roles, applications, interview history are protected", () => {
  assert.equal(classifyStoredJob(stored({ sourceName: "manual" }), none, ctx).bucket, "protected");
  assert.equal(classifyStoredJob(stored({ notes: "call recruiter" }), none, ctx).bucket, "protected");
  for (const status of ["saved", "interested", "applying", "applied", "recruiter_screen", "final_round", "offer", "rejected", "withdrawn", "interviewing"]) {
    assert.equal(classifyStoredJob(stored({ status }), none, ctx).bucket, "protected", status);
  }
  assert.equal(classifyStoredJob(stored(), { ...none, interviewPreps: 1 }, ctx).bucket, "protected");
  assert.equal(classifyStoredJob(stored(), { ...none, matches: 1 }, ctx).bucket, "protected");
  assert.equal(classifyStoredJob(stored({ duplicateReviewed: true }), none, ctx).bucket, "protected");
  assert.equal(classifyStoredJob(stored({ updatedAt: new Date(t0.getTime() + 60_000) }), none, ctx).bucket, "protected");
});

test("cleanup: ambiguous stays out of the archive bucket; paused searches never trigger mass-archive", () => {
  assert.equal(classifyStoredJob(stored({ location: "Remote", description: "Full-time. Fully remote." }), none, ctx).bucket, "review");
  const paused = classifyStoredJob(stored(), none, { searches: [{ ...usRemote, enabled: false }], source: null });
  assert.equal(paused.bucket, "keep");
  assert.equal(paused.code, "no_enabled_search_hold");
});

test("cleanup: excluded source and aggregator URL are archived; override respected", () => {
  assert.equal(classifyStoredJob(stored({ location: "Remote - US" }), none, { searches: [usRemote], source: { provider: "ashby", excluded: true } }).code, "excluded_source");
  assert.equal(classifyStoredJob(stored({ location: "Remote - US" }), none, { searches: [usRemote], source: { provider: "ashby", excluded: true, exclusionOverride: true } }).bucket, "keep");
  assert.equal(classifyStoredJob(stored({ jobUrl: "https://jobgether.com/offer/1" }), none, ctx).code, "aggregator_url");
});

test("cleanup: legacy job→source linking by URL token", () => {
  assert.deepEqual(boardTokenFromUrl("https://jobs.lever.co/Acme/abc-123"), { provider: "lever", token: "acme" });
  assert.deepEqual(boardTokenFromUrl("https://boards.greenhouse.io/acme/jobs/9"), { provider: "greenhouse", token: "acme" });
  assert.equal(boardTokenFromUrl("https://example.com/x"), null);
});

/* ------------------------- rev 2: the three reported gaps ------------------------- */

const decide = (l: NormalizedListing, search: SearchCriteria = usRemote) => evaluateListing(l, [search]);
const caSearch: SearchCriteria = { ...usRemote, id: "s-ca", label: "US remote, California-eligible", eligibleState: "CA" };
const contractSearch: SearchCriteria = { ...usRemote, id: "s-contract", label: "US remote contract", employmentType: "Contract" };

test("REGRESSION 1: location 'US' + 'This is not a remote role' must NOT pass a remote-only search", () => {
  const d = decide(listing({ location: "US", description: "Full-time. This is not a remote role." }));
  assert.notEqual(d.decision, "accept");
  assert.ok(d.decision === "reject" && d.code === "arrangement_mismatch");
});

test("REGRESSION 1b: negations and conflicts are handled conservatively", () => {
  const reject = (description: string, location = "US") => {
    const d = decide(listing({ location, description: `Full-time. ${description}` }));
    assert.ok(d.decision === "reject" && d.code === "arrangement_mismatch", `${description} -> ${JSON.stringify(d)}`);
  };
  reject("Remote work is not available for this position.");
  reject("We do not offer remote work.");
  reject("This role is not fully remote.");
  reject("This position cannot be performed remotely.");
  reject("Fully on-site.", "US (Non-remote)");
  // a conflict (says remote AND says not remote) is never a pass or a reject — a person decides
  const conflict = decide(listing({ location: "Remote - US", description: "Full-time. This is not a remote role." }));
  assert.ok(conflict.decision === "review" && conflict.codes.includes("arrangement_conflict"));
  // not every "no ... remote ..." is a negation of the arrangement
  assert.equal(decide(listing({ location: "Remote - US", description: "Full-time. No remote work experience required." })).decision, "accept");
  // an ordinary positive statement is unchanged
  assert.equal(decide(listing({ location: "US", description: "Full-time. This is a remote role." })).decision, "accept");
});

test("REGRESSION 2: 'Remote - US' + 'Applicants must reside in New York' must NOT pass a California-eligible search", () => {
  const d = decide(listing({ location: "Remote - US", description: "Full-time. Fully remote. Applicants must reside in New York." }), caSearch);
  assert.notEqual(d.decision, "accept");
  assert.ok(d.decision === "reject" && d.code === "state_not_eligible");
  // the same posting still passes a search with no state rule
  assert.equal(decide(listing({ location: "Remote - US", description: "Full-time. Fully remote. Applicants must reside in New York." })).decision, "accept");
});

test("REGRESSION 2b: California rule — explicit exclusions fail, unclear go to review, inclusions/no restriction pass", () => {
  const run = (description: string, location = "Remote - US") => decide(listing({ location, description: `Full-time. Fully remote. ${description}` }), caSearch);
  const fails = [
    "We are unable to hire in California.",
    "Open to candidates in all states except California.",
    "California residents are not eligible for this role.",
    "This role is not available in NY, CA or WA.",
    "Candidates must be located in Texas or Florida.",
    "Must reside in New York.",
  ];
  for (const text of fails) {
    const d = run(text);
    assert.ok(d.decision === "reject" && d.code === "state_not_eligible", `${text} -> ${JSON.stringify(d)}`);
  }
  const reviews: [string, string?][] = [
    ["We can only hire in certain states."],
    ["Compensation varies by state and we hire in select states."],
    ["Open to everyone.", "Remote - New York"],
    ["We cannot hire in California. California residents are welcome to apply.".replace(" California residents are welcome to apply.", ""), "Remote - Los Angeles, CA"], // location says CA, text excludes it
  ];
  for (const [text, location] of reviews) {
    const d = run(text, location);
    assert.equal(d.decision, "review", `${text} -> ${JSON.stringify(d)}`);
    assert.ok(d.decision === "review" && d.codes.includes("state_ambiguous"));
  }
  const passes: [string, string?][] = [
    ["Must reside in California, Texas, or New York."],
    ["Open to residents of TX, FL, or CA."],
    ["Not open to candidates outside California."],
    ["Must be located in the United States. Our design team is in New York."], // country-level, not a state restriction
    ["Collaborate with teams across the country."], // no restriction at all
    ["", "Remote - California"],
    ["", "Los Angeles, CA (Remote)"],
  ];
  for (const [text, location] of passes) assert.equal(run(text, location).decision, "accept", text || location);
  // misconfiguration is surfaced, not silently ignored
  const bad = decide(listing(), { ...usRemote, eligibleState: "TX" });
  assert.ok(bad.decision === "review" && bad.codes.includes("search_misconfigured"));
  const wrongCountry = decide(listing(), { ...usRemote, eligibleCountry: "CA", eligibleState: "CA" });
  assert.ok(wrongCountry.decision !== "accept");
});

test("REGRESSION 2c: a country label must not override a narrower country restriction in the description", () => {
  for (const description of ["Full-time. Fully remote. You must be located in Canada.", "Full-time. Fully remote. Candidates must be based in Germany."]) {
    const d = decide(listing({ location: "Remote - US", description }));
    assert.notEqual(d.decision, "accept", description);
    assert.ok(d.decision === "review" && d.codes.includes("geography_conflict"), description);
  }
  // A consistent US label passes; contradictory ATS metadata requires review.
  assert.equal(decide(listing({ location: "Remote - US", description: "Full-time. Fully remote. Must be located in the United States." })).decision, "accept");
  assert.equal(decide(listing({ location: "Remote - US", countryCodes: ["US"], description: "Full-time. Fully remote. You must be located in Canada." })).decision, "review");
});

test("REGRESSION 3: 'Product Designer - Full-time contract' must NOT fail a contract search", () => {
  for (const l of [
    listing({ title: "Product Designer - Full-time contract" }),
    listing({ title: "Product Designer (Full-Time Contract)" }),
    listing({ description: "This is a full-time contract position. Fully remote." }),
    listing({ employmentType: "Full-time Contract" }),
    listing({ title: "Product Designer", description: "Fully remote. 6-month contract, 40 hours per week." }),
  ]) {
    const d = decide(l, contractSearch);
    assert.equal(d.decision, "accept", JSON.stringify(l.title) + (l.description ?? ""));
  }
});

test("REGRESSION 3b: hours vs employment relationship — mixed terms are handled conservatively", () => {
  const full = usRemote; // wants Full-time
  const part: SearchCriteria = { ...usRemote, id: "s-part", employmentType: "Part-time" };
  // Same posting, two searches: a full-time contract is a CONTRACT role first
  const ftc = listing({ title: "Product Designer - Full-time contract" });
  assert.equal(decide(ftc, contractSearch).decision, "accept");
  const forFull = decide(ftc, full);
  assert.ok(forFull.decision === "review" && forFull.codes.includes("employment_type_ambiguous"), "full-time hours but not a standard employee role -> a person decides");
  // part-time contract
  const ptc = listing({ title: "Product Designer - Part-time contract" });
  assert.equal(decide(ptc, contractSearch).decision, "accept");
  assert.equal(decide(ptc, part).decision, "review");
  assert.equal(decide(ptc, full).decision, "reject");
  // unchanged clear cases
  assert.ok((decide(listing(), contractSearch) as { code?: string }).code === "employment_type_mismatch", "plain full-time is not a contract");
  assert.ok((decide(listing({ title: "Product Designer (Contract)" }), full) as { code?: string }).code === "employment_type_mismatch");
  assert.equal(decide(listing({ employmentType: "FullTime" }), full).decision, "accept");
  // contradictory hours with no relationship -> review, not a guess
  const both = decide(listing({ description: "Fully remote. We hire for full-time and part-time roles." }), full);
  assert.ok(both.decision === "review" && both.codes.includes("employment_type_ambiguous"));
  // contract-to-hire is a contract for a contract search
  assert.equal(decide(listing({ title: "Product Designer (Contract-to-hire)" }), contractSearch).decision, "accept");
});

/* ------------------------- rev 2: staged rollout ------------------------- */

test("rollout: scheduled imports are paused unless DISCOVERY_CRON_ENABLED is exactly 'true'", () => {
  assert.equal(discoveryCronEnabled({}), false);
  for (const v of ["", "TRUE", "True", "1", "yes", " true", "true ", "false"]) assert.equal(discoveryCronEnabled({ DISCOVERY_CRON_ENABLED: v }), false, JSON.stringify(v));
  assert.equal(discoveryCronEnabled({ DISCOVERY_CRON_ENABLED: "true" }), true);
});

test("rollout: imports are blocked until every ENABLED search has an eligible country", () => {
  const noCountry: SearchCriteria = { ...usRemote, id: "s-none", label: "Old search", eligibleCountry: null };
  const blocked = planDiscovery([listing(), listing({ sourceJobId: "2" })], source, [usRemote, noCountry]);
  assert.equal(blocked.accepted.length + blocked.review.length, 0, "a good job still waits while ANY enabled search lacks a country");
  assert.equal(blocked.rejectedCounts.search_missing_country, 2);
  assert.ok(REJECT_LABELS.search_missing_country);
  // a paused search doesn't block; setting the country unblocks
  assert.equal(planDiscovery([listing()], source, [usRemote, { ...noCountry, enabled: false }]).accepted.length, 1);
  assert.equal(planDiscovery([listing()], source, [usRemote, { ...noCountry, eligibleCountry: "US" }]).accepted.length, 1);
});

test("ATS remote flag cannot override explicit remote negation in description", () => {
  const d = evaluateListing(listing({ workplaceType: "remote", description: "Full-time. This is not a remote role." }), [usRemote]);
  assert.equal(d.decision, "review");
  assert.ok(d.decision === "review" && d.codes.includes("arrangement_conflict"));
});

test("ATS US country cannot override a narrower Canada-only restriction", () => {
  const d = evaluateListing(listing({ countryCodes: ["US"], description: "Full-time. Fully remote. Applicants must be located in Canada." }), [usRemote]);
  assert.equal(d.decision, "review");
  assert.ok(d.decision === "review" && d.codes.includes("geography_conflict"));
});

test("Ashby-style country names normalize alongside ISO country codes", () => {
  assert.equal(evaluateListing(listing({ countryCodes: ["United States"], workplaceType: "Remote", employmentType: "FullTime" }), [usRemote]).decision, "accept");
  assert.equal(evaluateListing(listing({ countryCodes: ["Canada"], workplaceType: "Remote", employmentType: "FullTime" }), [usRemote]).decision, "reject");
});
