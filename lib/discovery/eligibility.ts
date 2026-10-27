import type { NormalizedListing } from "@/lib/ats/types";
import { matchesDesignRole } from "@/lib/ats/normalize";

/**
 * Saved-search eligibility gate. PURE (no DB, no network) so it can be unit-tested and reused by
 * the importer (app/actions/ats.ts) and the cleanup preview (scripts/discovery-maintenance.ts).
 *
 * A listing qualifies when it satisfies EVERY required condition of AT LEAST ONE enabled,
 * provider-relevant saved search. Each condition is tri-state:
 *   pass   – stated and satisfied
 *   fail   – stated and violated  -> rejected (never inserted, never analyzed)
 *   review – missing/ambiguous    -> inserted as "needs_review" (no AI analysis until approved)
 * "Remote" is a WORK ARRANGEMENT; it never satisfies a geography requirement by itself.
 */

export type Outcome = "pass" | "review" | "fail";

export interface SearchCriteria {
  id: string;
  label: string;
  enabled: boolean;
  keywords: string[];
  locationQuery: string | null;
  employmentType: string | null;
  eligibleCountry: string | null;
  /** Optional US-state eligibility. Only "CA" (California) is supported. Null/undefined = no state rule. */
  eligibleState?: string | null;
  workArrangement: string | null;
  excludedTitleTerms: string[];
  providers: string[];
}

export interface SourceInfo {
  provider: string;
  excluded?: boolean;
  exclusionOverride?: boolean;
}

export const REJECT_LABELS: Record<string, string> = {
  excluded_source: "Source excluded",
  aggregator_url: "Aggregator posting URL (e.g. Jobgether)",
  no_enabled_search: "No enabled saved search",
  no_search_for_provider: "No enabled search covers this ATS",
  not_design_role: "Not a UX/Product Design title",
  no_keyword_match: "Title doesn't match search keywords",
  excluded_title_term: "Excluded title term",
  country_not_eligible: "Not open to the eligible country",
  state_not_eligible: "Not open to residents of the eligible state",
  search_missing_country: "Saved search has no eligible country yet (imports paused)",
  arrangement_mismatch: "Work arrangement mismatch",
  employment_type_mismatch: "Employment type mismatch",
  location_text_mismatch: "Location text mismatch",
};

export const REVIEW_LABELS: Record<string, string> = {
  geography_ambiguous: "Eligible country not stated / ambiguous",
  geography_conflict: "Location says one country, description restricts to another",
  state_ambiguous: "State eligibility unclear",
  arrangement_conflict: "Work arrangement statements conflict",
  employment_type_ambiguous: "Employment type mixed or conflicting",
  arrangement_unknown: "Work arrangement not stated",
  employment_type_unknown: "Employment type not stated",
  location_unknown: "Location missing",
  search_misconfigured: "Search setting not recognized",
};

/* ----------------------------------------------------------------------------------------- */
/* Text helpers                                                                              */
/* ----------------------------------------------------------------------------------------- */

function norm(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\bu\.\s?s\.\s?a?\.?/g, "us")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word (alphanumeric-boundary) containment. */
export function hasTerm(haystack: string, term: string): boolean {
  const t = norm(term);
  if (!t) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(t)}([^a-z0-9]|$)`, "i").test(haystack);
}

/* ----------------------------------------------------------------------------------------- */
/* Geography                                                                                 */
/* ----------------------------------------------------------------------------------------- */

interface Country {
  code: string;
  name: string;
  aliases: string[];
}

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", aliases: ["united states", "united states of america", "usa", "us"] },
  { code: "CA", name: "Canada", aliases: ["canada"] },
  { code: "GB", name: "United Kingdom", aliases: ["united kingdom", "uk", "great britain", "england", "scotland", "wales", "northern ireland"] },
  { code: "IE", name: "Ireland", aliases: ["ireland"] },
  { code: "DE", name: "Germany", aliases: ["germany", "deutschland"] },
  { code: "FR", name: "France", aliases: ["france"] },
  { code: "ES", name: "Spain", aliases: ["spain"] },
  { code: "PT", name: "Portugal", aliases: ["portugal"] },
  { code: "IT", name: "Italy", aliases: ["italy"] },
  { code: "NL", name: "Netherlands", aliases: ["netherlands", "the netherlands", "holland"] },
  { code: "BE", name: "Belgium", aliases: ["belgium"] },
  { code: "CH", name: "Switzerland", aliases: ["switzerland"] },
  { code: "AT", name: "Austria", aliases: ["austria"] },
  { code: "SE", name: "Sweden", aliases: ["sweden"] },
  { code: "NO", name: "Norway", aliases: ["norway"] },
  { code: "DK", name: "Denmark", aliases: ["denmark"] },
  { code: "FI", name: "Finland", aliases: ["finland"] },
  { code: "PL", name: "Poland", aliases: ["poland"] },
  { code: "RO", name: "Romania", aliases: ["romania"] },
  { code: "GR", name: "Greece", aliases: ["greece"] },
  { code: "TR", name: "Turkey", aliases: ["turkey", "turkiye"] },
  { code: "IL", name: "Israel", aliases: ["israel"] },
  { code: "AE", name: "United Arab Emirates", aliases: ["united arab emirates", "uae", "dubai"] },
  { code: "IN", name: "India", aliases: ["india"] },
  { code: "PK", name: "Pakistan", aliases: ["pakistan"] },
  { code: "SG", name: "Singapore", aliases: ["singapore"] },
  { code: "JP", name: "Japan", aliases: ["japan"] },
  { code: "KR", name: "South Korea", aliases: ["south korea", "korea"] },
  { code: "CN", name: "China", aliases: ["china"] },
  { code: "AU", name: "Australia", aliases: ["australia"] },
  { code: "NZ", name: "New Zealand", aliases: ["new zealand"] },
  { code: "BR", name: "Brazil", aliases: ["brazil", "brasil"] },
  { code: "MX", name: "Mexico", aliases: ["mexico"] },
  { code: "AR", name: "Argentina", aliases: ["argentina"] },
  { code: "CO", name: "Colombia", aliases: ["colombia"] },
  { code: "CL", name: "Chile", aliases: ["chile"] },
  { code: "ZA", name: "South Africa", aliases: ["south africa"] },
  { code: "NG", name: "Nigeria", aliases: ["nigeria"] },
  { code: "KE", name: "Kenya", aliases: ["kenya"] },
  { code: "EG", name: "Egypt", aliases: ["egypt"] },
  { code: "PH", name: "Philippines", aliases: ["philippines"] },
  { code: "ID", name: "Indonesia", aliases: ["indonesia"] },
  { code: "VN", name: "Vietnam", aliases: ["vietnam"] },
];

/** Regions that clearly EXCLUDE the US (unless a US signal is also present). */
const OTHER_REGIONS = ["emea", "apac", "latam", "europe", "eu", "asia", "africa", "middle east", "dach", "nordics", "oceania", "anz", "cee", "benelux", "uk & ireland", "uk and ireland"];
/** Regions/phrases that MAY include the US — never enough on their own. */
const AMBIGUOUS_REGIONS = ["north america", "americas", "worldwide", "global", "globally", "anywhere", "international", "work from anywhere", "world wide"];

const US_STATE_ABBR = "AL AK AZ AR CA CO CT DC FL GA HI ID IL KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
// DE (Delaware/Germany) and IN (Indiana/India) are deliberately omitted — too ambiguous to count as a US signal.
const US_STATE_ABBR_RE = new RegExp(`,\\s*(?:${US_STATE_ABBR.join("|")})(?![A-Za-z])`);
const US_STATE_NAMES = ["alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "florida", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington dc", "washington, dc", "west virginia", "wisconsin", "wyoming"];

export function resolveCountry(input: string | null | undefined): Country | null {
  const v = norm(input);
  if (!v) return null;
  return COUNTRIES.find((c) => c.code.toLowerCase() === v || norm(c.name) === v || c.aliases.includes(v)) ?? null;
}

interface SegmentFacts {
  countries: Set<string>;
  otherRegion: boolean;
  ambiguousRegion: boolean;
}

function segmentFacts(rawSegment: string): SegmentFacts {
  const text = norm(rawSegment);
  const facts: SegmentFacts = { countries: new Set(), otherRegion: false, ambiguousRegion: false };

  for (const c of COUNTRIES) {
    for (const alias of c.aliases) {
      // "us" is only trusted in short location strings; callers pass location text, never prose.
      if (hasTerm(text, alias)) facts.countries.add(c.code);
    }
  }
  if (!facts.countries.has("US")) {
    const hasCanada = facts.countries.has("CA");
    if (!hasCanada && US_STATE_ABBR_RE.test(rawSegment)) facts.countries.add("US");
    if (US_STATE_NAMES.some((s) => hasTerm(text, s))) facts.countries.add("US");
  }
  facts.otherRegion = OTHER_REGIONS.some((r) => hasTerm(text, r));
  facts.ambiguousRegion = AMBIGUOUS_REGIONS.some((r) => hasTerm(text, r));
  return facts;
}

/** Strong, explicit statements in the posting body. Used ONLY when the location field names no country. */
function descriptionGeography(description: string, target: Country): { positive: boolean; negative: boolean } {
  const d = norm(description).slice(0, 8000);
  const t = norm(target.name);
  const names = [t, ...target.aliases.filter((a) => a.length >= 2)].map(escapeRegExp).join("|");
  const targetRe = `(?:the\\s+)?(?:${names})`;

  const positives = [
    new RegExp(`(?:must|need to|required to|should|have to)\\s+(?:be\\s+)?(?:located|based|reside|residing|live|living)\\s+(?:in|within)\\s+${targetRe}\\b`),
    new RegExp(`\\b(?:${names})[- ]based\\b`),
    new RegExp(`authori[sz]ed to work (?:in|within)\\s+${targetRe}\\b`),
    new RegExp(`open to (?:candidates|applicants)\\s+(?:located\\s+)?(?:in|across|throughout)\\s+${targetRe}\\b`),
    new RegExp(`\\bremote\\s*[(\\-,]\\s*(?:${names})\\b`),
    new RegExp(`\\bremote in\\s+${targetRe}\\b`),
  ];

  const otherNames = COUNTRIES.filter((c) => c.code !== target.code)
    .flatMap((c) => [norm(c.name), ...c.aliases.filter((a) => a.length >= 2)])
    .concat(OTHER_REGIONS.filter((r) => r.length >= 2))
    .map(escapeRegExp)
    .join("|");
  const negatives = [
    new RegExp(`(?:must|need to|required to|should|have to)\\s+(?:be\\s+)?(?:located|based|reside|residing|live|living)\\s+(?:in|within)\\s+(?:the\\s+)?(?:${otherNames})\\b`),
    new RegExp(`\\bonly (?:open to|considering|accepting) (?:candidates|applicants)\\s+(?:located\\s+)?(?:in|from)\\s+(?:the\\s+)?(?:${otherNames})\\b`),
  ];

  return { positive: positives.some((re) => re.test(d)), negative: negatives.some((re) => re.test(d)) };
}

export interface Check {
  name: "keyword" | "excluded_title" | "geography" | "state" | "arrangement" | "employment" | "location_text";
  outcome: Outcome;
  code: string;
  detail: string;
}

export function checkGeography(listing: NormalizedListing, countryInput: string): Check {
  const target = resolveCountry(countryInput);
  if (!target) {
    return { name: "geography", outcome: "review", code: "search_misconfigured", detail: `eligible country "${countryInput}" isn't recognized` };
  }

  // 1) Structured country codes from the ATS beat any text parsing.
  const codes = (listing.countryCodes ?? []).map((c) => resolveCountry(c)?.code ?? c.trim().toUpperCase()).filter(Boolean);
  if (codes.length > 0) {
    const narrower = descriptionGeography(listing.description, target);
    if (codes.includes(target.code) && narrower.negative && !narrower.positive) {
      return { name: "geography", outcome: "review", code: "geography_conflict", detail: `ATS lists ${target.code}, but the description restricts to another country/region` };
    }
    return codes.includes(target.code)
      ? { name: "geography", outcome: "pass", code: "ok", detail: `${target.code} listed by the ATS` }
      : { name: "geography", outcome: "fail", code: "country_not_eligible", detail: `ATS lists ${codes.join(", ")} only` };
  }

  // 2) Location text, segment by segment.
  const location = listing.location ?? "";
  const segments = location.split(/;|\||\/|\s+or\s+|•/i).map((s) => s.trim()).filter(Boolean);
  const facts = segments.map(segmentFacts);
  const inTarget = facts.some((f) => f.countries.has(target.code));
  const otherCountries = new Set<string>();
  facts.forEach((f) => f.countries.forEach((c) => c !== target.code && otherCountries.add(c)));
  const otherRegion = facts.some((f) => f.otherRegion);
  const ambiguousRegion = facts.some((f) => f.ambiguousRegion);

  if (inTarget) {
    // A country label must not override a narrower country restriction stated in the description.
    const narrower = descriptionGeography(listing.description, target);
    if (narrower.negative && !narrower.positive) {
      return { name: "geography", outcome: "review", code: "geography_conflict", detail: `location "${location.trim()}" names ${target.code}, but the description restricts to another country/region` };
    }
    return { name: "geography", outcome: "pass", code: "ok", detail: `${target.code} in location "${location.trim()}"` };
  }
  if ((otherCountries.size > 0 || otherRegion) && !ambiguousRegion) {
    const named = [...otherCountries].join(", ") || "non-" + target.code + " region";
    return { name: "geography", outcome: "fail", code: "country_not_eligible", detail: `location "${location.trim()}" names ${named} only` };
  }

  // 3) Location says nothing usable ("Remote", "", worldwide...). Fall back to explicit description statements.
  const desc = descriptionGeography(listing.description, target);
  if (desc.positive && !desc.negative) return { name: "geography", outcome: "pass", code: "ok", detail: `description states ${target.code}-based/authorized requirement` };
  if (desc.negative && !desc.positive) return { name: "geography", outcome: "fail", code: "country_not_eligible", detail: "description restricts to another country/region" };

  const why = location.trim() ? `location "${location.trim()}" doesn't name ${target.name}` : "no location given";
  return { name: "geography", outcome: "review", code: location.trim() ? "geography_ambiguous" : "location_unknown", detail: why };
}

/* ----------------------------------------------------------------------------------------- */
/* State eligibility (minimal: California only)                                              */
/* ----------------------------------------------------------------------------------------- */

const STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "washington dc": "DC", "washington, dc": "DC", "district of columbia": "DC",
};
// Uppercase abbreviations that are also ordinary words / other countries are never trusted on their own.
const SAFE_ABBR = new Set("AL AK AZ AR CA CO CT FL GA IL IA KS KY MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));

export function normalizeStateSetting(value: string | null | undefined): "CA" | null {
  const v = norm(value);
  return v === "ca" || v === "california" ? "CA" : null;
}

/** US state codes named in a piece of text. Full names always count; abbreviations only when UPPERCASE and unambiguous. */
function statesNamedIn(raw: string): Set<string> {
  const found = new Set<string>();
  const text = norm(raw);
  for (const [name, code] of Object.entries(STATE_CODES)) {
    if (name === "washington") {
      if (/(^|[^a-z0-9])washington(?!,? ?d\.?c)([^a-z0-9]|$)/.test(text)) found.add("WA");
    } else if (hasTerm(text, name)) found.add(code);
  }
  for (const m of raw.matchAll(/(?<![A-Za-z])([A-Z]{2})(?![A-Za-z])/g)) {
    if (SAFE_ABBR.has(m[1])) found.add(m[1]);
  }
  // "CA" next to "Canada" is the country, not the state.
  if (found.has("CA") && /canada/i.test(raw) && !/california/i.test(raw)) found.delete("CA");
  return found;
}

/** Sentences where the posting says who it CANNOT hire / is NOT open to, and which states those sentences name. */
const STATE_EXCLUSION_CUE = /\b(?:excluding|except(?: for)?|other than|excludes?|not (?:currently |presently )?(?:available|open|eligible|hiring|offered|accepting)|ineligible|(?:unable|not able) to (?:hire|employ)|(?:cannot|can ?not|can't|do not|don't|does not|doesn't|will not|won't) (?:currently )?(?:hire|employ|consider|accept))\b/;
const STATE_RESTRICTION_CUE = /\b(?:must (?:currently )?(?:reside|live|be (?:located|based|a resident))(?: in| within)?|(?:residents?|candidates?|applicants?) (?:of|in|from|residing in|located in|based in)|only (?:hiring|open to|available|considering|accepting)(?: [a-z]+)?(?: in| from)?|hiring (?:only )?in|(?:the )?following states|eligible states|authori[sz]ed states)\b/;
const STATE_AMBIGUOUS_CUE = /\b(?:(?:certain|select|specific|limited|approved|listed|eligible) states|not (?:available|open|hiring) in all states|(?:states|jurisdictions) (?:where|in which) (?:we|the company) (?:operate|are registered|have (?:an )?(?:entity|presence)|hire)|depending on (?:your )?(?:state|location)|subject to (?:your )?(?:state|location)|varies by state|registered to (?:do business|hire) in)\b/;

export function checkState(listing: NormalizedListing, stateInput: string, countryCode: string | null): Check {
  const target = normalizeStateSetting(stateInput);
  if (!target) return { name: "state", outcome: "review", code: "search_misconfigured", detail: `eligible state "${stateInput}" isn't supported (only California)` };
  if (countryCode && countryCode !== "US") return { name: "state", outcome: "review", code: "search_misconfigured", detail: "a state rule needs the eligible country to be the United States" };

  const location = listing.location ?? "";
  const locStates = statesNamedIn(location);
  const excluded = { ca: false, otherOnly: false };
  const included = { ca: locStates.has("CA") };

  const raw = (listing.description ?? "").slice(0, 8000).replace(/\r?\n+/g, ". ");
  const sentences = raw.split(/(?<=[.!?;])\s+/).map((s) => s.trim()).filter(Boolean);
  let ambiguous = false;

  for (const sentence of sentences) {
    const low = norm(sentence);

    // (a) "excluding California", "not available in CA", "California residents are not eligible"
    const cue = STATE_EXCLUSION_CUE.exec(low);
    if (cue) {
      const after = low.slice(cue.index + cue[0].length);
      const m = /california/.exec(after);
      const inSentenceStates = statesNamedIn(sentence.slice(Math.max(0, sentence.toLowerCase().indexOf(cue[0]) + cue[0].length)));
      if (m || inSentenceStates.has("CA")) {
        const idx = m ? m.index : 0;
        const between = after.slice(0, idx);
        if (/\boutside\b|\bbeyond\b|\bapart from\b|\bnot (?:in|from|residing in)\b/.test(between)) included.ca = true; // "not open to candidates outside California"
        else excluded.ca = true;
      }
    }
    if (/\bcalifornia (?:residents|candidates|applicants)\b[^.]{0,40}\b(?:not (?:eligible|considered|accepted)|ineligible|excluded|cannot)\b/.test(low)) excluded.ca = true;

    // (b) "must reside in New York", "open to residents of TX, FL, or CA"
    // A sentence that already read as an exclusion list ("all states except California") is not also a residency list.
    const r = cue ? null : STATE_RESTRICTION_CUE.exec(low);
    if (r) {
      const start = sentence.toLowerCase().indexOf(r[0]);
      const clauseRaw = sentence.slice(start >= 0 ? start + r[0].length : 0, (start >= 0 ? start + r[0].length : 0) + 140);
      const clauseLow = norm(clauseRaw);
      const countryFirst = /^(?:the )?(?:us|usa|united states(?: of america)?)\b/.test(clauseLow); // country-level, not a state list
      const clauseStates = countryFirst && !/following states|eligible states/.test(r[0]) ? new Set<string>() : statesNamedIn(clauseRaw);
      if (clauseStates.size > 0) {
        if (clauseStates.has("CA")) included.ca = true;
        else excluded.otherOnly = true;
      }
    }
    if (STATE_AMBIGUOUS_CUE.test(low)) ambiguous = true;
  }

  const namedElsewhere = locStates.size > 0 && !locStates.has("CA");

  if ((excluded.ca || excluded.otherOnly) && included.ca) {
    return { name: "state", outcome: "review", code: "state_ambiguous", detail: "posting makes conflicting statements about California eligibility" };
  }
  if (excluded.ca) return { name: "state", outcome: "fail", code: "state_not_eligible", detail: "posting explicitly excludes California" };
  if (excluded.otherOnly) return { name: "state", outcome: "fail", code: "state_not_eligible", detail: "posting restricts residency to other states (California not listed)" };
  if (included.ca) return { name: "state", outcome: "pass", code: "ok", detail: "California is eligible" };
  if (ambiguous) return { name: "state", outcome: "review", code: "state_ambiguous", detail: "posting hires only in certain states and doesn't say whether California is one" };
  if (namedElsewhere) return { name: "state", outcome: "review", code: "state_ambiguous", detail: `location "${location.trim()}" names another state only — unclear whether California residents are eligible` };
  return { name: "state", outcome: "pass", code: "ok", detail: "no state restriction stated" };
}

/* ----------------------------------------------------------------------------------------- */
/* Work arrangement                                                                          */
/* ----------------------------------------------------------------------------------------- */

export type Arrangement = "remote" | "hybrid" | "onsite";

export function normalizeArrangementSetting(value: string | null | undefined): Arrangement | null {
  const v = norm(value).replace(/[-_\s]/g, "");
  if (v === "remote") return "remote";
  if (v === "hybrid") return "hybrid";
  if (v === "onsite" || v === "inoffice") return "onsite";
  return null;
}

const ARRANGEMENT_WORDS: Record<Arrangement, string> = {
  remote: "(?:remote(?:-first|-friendly)?|remotely|work from home|wfh|distributed team)",
  hybrid: "hybrid",
  onsite: "(?:on-?site|in-?office|in the office)",
};
const NEG_LEAD = "(?:not|isn't|isnt|is not|aren't|are not|no|non|never|without|cannot|can't|cant)";
const NEG_FILLER = "(?:(?:a|an|the|fully|100%|completely|totally|purely|entirely|really|currently|be|offered|available|as|eligible for|open to|any)[\\s-]+){0,3}";

/** Sentence-level negation of an arrangement, e.g. "this is not a remote role", "non-remote", "remote work is not available". */
function negatesArrangement(sentence: string, which: Arrangement): boolean {
  const w = ARRANGEMENT_WORDS[which];
  const patterns = [
    new RegExp(`\\b${NEG_LEAD}[\\s-]+${NEG_FILLER}${w}\\b(?!(?:\\s+work)?\\s+experience)`),
    new RegExp(`\\b${w}\\s*(?:work(?:ing)?|options?|positions?|roles?|arrangements?|opportunit(?:y|ies))?\\s*(?:is|are)?\\s*(?:not|n't)\\s*(?:currently\\s*)?(?:available|offered|possible|supported|permitted|allowed|an option|considered|eligible)`),
    new RegExp(`\\b(?:does not|doesn't|do not|don't|will not|won't|unable to)\\s+(?:offer|support|allow|permit|provide)\\s+(?:any\\s+)?${w}`),
  ];
  if (which === "remote") patterns.push(/\b(?:cannot|can't|can not|unable to)\s+(?:be\s+)?(?:done|performed|worked|completed|carried out)\s+remotely\b/);
  return patterns.some((re) => re.test(sentence));
}

/** Sentences of a text field, lowercased, so negation and conflict can be judged per statement. */
function sentencesOf(raw: string | null | undefined): string[] {
  const t = (raw ?? "")
    .replace(/\r?\n+/g, ". ")
    .replace(/\bu\.\s?s\.\s?a?\.?/gi, "US")
    .replace(/[\u2013\u2014]/g, "-");
  return t
    .split(/[.!?;]+\s+|[.!?;]+$/)
    .map((s) => s.toLowerCase().replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export interface ArrangementFacts {
  /** Arrangements the posting states positively. */
  found: Set<Arrangement>;
  /** Arrangements the posting explicitly says it is NOT (e.g. "this is not a remote role"). */
  negated: Set<Arrangement>;
}

export function detectArrangementFacts(listing: NormalizedListing): ArrangementFacts {
  const found = new Set<Arrangement>();
  const negated = new Set<Arrangement>();

  const structured = normalizeArrangementSetting(listing.workplaceType);
  if (structured) {
    for (const sentence of sentencesOf((listing.description ?? "").slice(0, 6000))) {
      if (negatesArrangement(sentence, structured)) negated.add(structured);
    }
    return { found: new Set([structured]), negated };
  }

  const kinds: Arrangement[] = ["remote", "hybrid", "onsite"];
  const loose: Record<Arrangement, RegExp> = {
    remote: /\bremote\b|work from home|\bwfh\b|distributed team/,
    hybrid: /\bhybrid\b/,
    onsite: /\bon-?site\b|\bin[- ]office\b|\bonsite\b/,
  };
  const scan = (sentences: string[], positives: Record<Arrangement, RegExp>) => {
    for (const sentence of sentences) {
      for (const k of kinds) {
        if (negatesArrangement(sentence, k)) negated.add(k);
        else if (positives[k].test(sentence)) found.add(k);
      }
    }
  };

  // Location + title: any mention counts (as before), but "non-remote" / "not remote" is a negation.
  scan([...sentencesOf(listing.location), ...sentencesOf(listing.title)], loose);

  // Description: only explicit statements count as positive; negations are always collected so a conflict is visible.
  const strict: Record<Arrangement, RegExp> = {
    remote: /\b(?:fully|100%|completely)\s+remote\b|\bthis is a remote (?:role|position|job|opportunity)\b|\bremote-first\b|\bremote (?:position|role)\b/,
    hybrid: /\bhybrid (?:role|position|schedule|work model|work environment)\b|\b[1-5] days? (?:per|a|each) week in (?:the |our )?office\b/,
    onsite: /\b(?:on-?site|in-office) (?:role|position)\b|\bthis is an? (?:on-?site|in-office)\b/,
  };
  const before = new Set(found);
  scan(sentencesOf((listing.description ?? "").slice(0, 6000)), strict);
  // Keep description positives only when location/title said nothing positive (rev-1 behavior).
  if (before.size > 0) for (const k of kinds) if (!before.has(k)) found.delete(k);
  return { found, negated };
}

export function detectArrangements(listing: NormalizedListing): Set<Arrangement> {
  return detectArrangementFacts(listing).found;
}

export function checkArrangement(listing: NormalizedListing, required: Arrangement): Check {
  const { found, negated } = detectArrangementFacts(listing);
  if (found.has(required) && negated.has(required)) {
    return { name: "arrangement", outcome: "review", code: "arrangement_conflict", detail: `posting says both that it is ${required} and that it is not` };
  }
  if (found.has(required)) return { name: "arrangement", outcome: "pass", code: "ok", detail: [...found].join("/") };
  if (negated.has(required)) {
    return { name: "arrangement", outcome: "fail", code: "arrangement_mismatch", detail: `posting says it is not ${required}${found.size ? ` (it is ${[...found].join("/")})` : ""}` };
  }
  if (found.size === 0) return { name: "arrangement", outcome: "review", code: "arrangement_unknown", detail: "work arrangement not stated" };
  return { name: "arrangement", outcome: "fail", code: "arrangement_mismatch", detail: `posting is ${[...found].join("/")}, search wants ${required}` };
}

/* ----------------------------------------------------------------------------------------- */
/* Employment type                                                                           */
/* ----------------------------------------------------------------------------------------- */

export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "temporary";
type EmploymentToken = EmploymentType | "permanent";

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: "full-time",
  part_time: "part-time",
  contract: "contract",
  internship: "internship",
  temporary: "temporary",
};
const RELATIONSHIPS: EmploymentType[] = ["contract", "internship", "temporary"];
const HOURS: EmploymentType[] = ["full_time", "part_time"];

/** Every employment term in a short field (ATS value, title, location). Hours and relationship terms are kept separate on purpose. */
function looseEmploymentTokens(raw: string | null | undefined): Set<EmploymentToken> {
  const v = norm(raw).replace(/[-_]/g, " ");
  const out = new Set<EmploymentToken>();
  if (!v) return out;
  if (/\bfull ?time\b|\bft\b/.test(v)) out.add("full_time");
  if (/\bpart ?time\b|\bpt\b/.test(v)) out.add("part_time");
  if (/\bpermanent\b|\bregular\b/.test(v)) out.add("permanent");
  if (/\bintern(ship)?\b/.test(v)) out.add("internship");
  if (/\btemp(orary)?\b/.test(v)) out.add("temporary");
  if (/\bcontract(or)?\b|\bfreelance\b|\bfixed term\b/.test(v)) out.add("contract");
  return out;
}

/** A search's single employment-type setting. Relationship terms (contract/intern/temp) win over hours terms. */
export function normalizeEmploymentType(value: string | null | undefined): EmploymentType | null {
  const t = looseEmploymentTokens(value);
  for (const k of ["internship", "temporary", "contract", "part_time", "full_time"] as EmploymentType[]) if (t.has(k)) return k;
  return t.has("permanent") ? "full_time" : null;
}

export interface EmploymentFacts {
  tokens: Set<EmploymentToken>;
  source: string;
}

export function detectEmploymentFacts(listing: NormalizedListing): EmploymentFacts {
  const structured = looseEmploymentTokens(listing.employmentType);
  if (structured.size > 0) return { tokens: structured, source: "ATS" };

  const fromTitle = looseEmploymentTokens(`${listing.title} ${listing.location ?? ""}`);
  if (fromTitle.size > 0) return { tokens: fromTitle, source: "title" };

  const d = norm(listing.description).slice(0, 8000);
  const tokens = new Set<EmploymentToken>();
  if (/\bfull[- ]time\b/.test(d)) tokens.add("full_time");
  if (/\bpart[- ]time\b/.test(d)) tokens.add("part_time");
  if (/\bcontract (?:position|role|opportunity|basis|assignment|engagement)\b|\bcontract[- ]to[- ]hire\b|\b\d+[- ]month contract\b|\bfreelance (?:position|role)\b|\bfull[- ]time contract\b|\bw-?2 contract\b|\b1099 contract/.test(d)) tokens.add("contract");
  if (/\binternship (?:position|role|program)\b|\bthis is an internship\b/.test(d)) tokens.add("internship");
  return { tokens, source: "description" };
}

function describeTokens(tokens: Set<EmploymentToken>): string {
  const hours = HOURS.filter((h) => tokens.has(h)).map((h) => EMPLOYMENT_LABELS[h]);
  const rel = RELATIONSHIPS.filter((r) => tokens.has(r)).map((r) => EMPLOYMENT_LABELS[r]);
  const parts = [...hours, ...rel];
  if (tokens.has("permanent")) parts.push("permanent");
  return parts.join(" ") || "unspecified";
}

/**
 * Hours (full/part-time) and employment relationship (contract/internship/temporary) are different questions.
 * "Full-time contract" is a CONTRACT role that happens to be full-time hours.
 *  - Contract/intern/temp search: passes when that relationship is stated, whatever the hours.
 *  - Full/part-time search: a stated non-employee relationship is never a clean pass — matching hours => needs review, otherwise reject.
 */
export function checkEmploymentType(listing: NormalizedListing, requiredRaw: string): Check {
  const required = normalizeEmploymentType(requiredRaw);
  if (!required) {
    return { name: "employment", outcome: "review", code: "search_misconfigured", detail: `employment type "${requiredRaw}" isn't recognized` };
  }
  const { tokens, source } = detectEmploymentFacts(listing);
  const seen = `${describeTokens(tokens)} (${source})`;
  const want = EMPLOYMENT_LABELS[required];
  const mismatch = (): Check => ({ name: "employment", outcome: "fail", code: "employment_type_mismatch", detail: `posting is ${seen}, search wants ${want}` });

  if (tokens.size === 0) return { name: "employment", outcome: "review", code: "employment_type_unknown", detail: "employment type not stated" };

  const rel = RELATIONSHIPS.filter((r) => tokens.has(r));
  const hours = HOURS.filter((h) => tokens.has(h));

  if (RELATIONSHIPS.includes(required)) {
    if (tokens.has(required)) return { name: "employment", outcome: "pass", code: "ok", detail: `${seen}` };
    return mismatch(); // a different relationship, or plain full/part-time/permanent employment
  }

  // Hours search (full-time / part-time)
  if (rel.length > 0) {
    if (hours.includes(required)) {
      return { name: "employment", outcome: "review", code: "employment_type_ambiguous", detail: `posting is ${seen} — ${want} hours, but not a standard employee role` };
    }
    return mismatch();
  }
  if (hours.length > 1) return { name: "employment", outcome: "review", code: "employment_type_ambiguous", detail: "conflicting full-time and part-time statements" };
  if (hours.includes(required) || (required === "full_time" && tokens.has("permanent") && hours.length === 0)) {
    return { name: "employment", outcome: "pass", code: "ok", detail: seen };
  }
  return mismatch();
}

/** Back-compat shim: the single most specific type, or null. */
export function detectEmploymentType(listing: NormalizedListing): { type: EmploymentType | null; ambiguous: boolean; source: string } {
  const { tokens, source } = detectEmploymentFacts(listing);
  const types = [...RELATIONSHIPS, ...HOURS].filter((t) => tokens.has(t));
  const type = RELATIONSHIPS.find((t) => tokens.has(t)) ?? (types.length === 1 ? types[0] : null);
  return { type: type ?? (tokens.has("permanent") ? "full_time" : null), ambiguous: types.length > 1 && !type, source };
}

/* ----------------------------------------------------------------------------------------- */
/* Evaluation                                                                                */
/* ----------------------------------------------------------------------------------------- */

export interface SearchVerdict {
  searchId: string;
  label: string;
  outcome: Outcome;
  checks: Check[];
}

export function evaluateAgainstSearch(listing: NormalizedListing, search: SearchCriteria): SearchVerdict {
  const checks: Check[] = [];
  const title = norm(listing.title);

  // Required: title keyword
  const keyword = search.keywords.find((k) => k.trim() && title.includes(norm(k)));
  if (search.keywords.length === 0 || keyword) {
    checks.push({ name: "keyword", outcome: "pass", code: "ok", detail: keyword ? `title has "${keyword}"` : "no keyword filter" });
  } else {
    checks.push({ name: "keyword", outcome: "fail", code: "no_keyword_match", detail: "title matches none of the search keywords" });
  }

  // Required: no excluded title term
  const excluded = search.excludedTitleTerms.find((t) => hasTerm(title, t));
  if (excluded) checks.push({ name: "excluded_title", outcome: "fail", code: "excluded_title_term", detail: `title contains excluded term "${excluded}"` });

  // Geography
  if (search.eligibleCountry) checks.push(checkGeography(listing, search.eligibleCountry));

  // State (California-only, optional)
  if (search.eligibleState && search.eligibleState.trim()) {
    checks.push(checkState(listing, search.eligibleState, resolveCountry(search.eligibleCountry)?.code ?? null));
  }

  // Work arrangement (legacy: locationQuery "Remote" with no explicit arrangement means remote)
  const legacyRemote = !search.workArrangement && norm(search.locationQuery) === "remote";
  const arrangement = normalizeArrangementSetting(search.workArrangement) ?? (legacyRemote ? "remote" : null);
  if (search.workArrangement && !arrangement) {
    checks.push({ name: "arrangement", outcome: "review", code: "search_misconfigured", detail: `work arrangement "${search.workArrangement}" isn't recognized` });
  } else if (arrangement) {
    checks.push(checkArrangement(listing, arrangement));
  }

  // Legacy free-text location (anything other than the bare "Remote")
  if (search.locationQuery && !legacyRemote && norm(search.locationQuery) !== "remote") {
    const loc = norm(listing.location);
    const q = norm(search.locationQuery);
    if (!loc) checks.push({ name: "location_text", outcome: "review", code: "location_unknown", detail: "no location given" });
    else if (loc.includes(q)) checks.push({ name: "location_text", outcome: "pass", code: "ok", detail: `location matches "${search.locationQuery}"` });
    else checks.push({ name: "location_text", outcome: "fail", code: "location_text_mismatch", detail: `location "${listing.location}" ≠ "${search.locationQuery}"` });
  }

  // Employment type
  if (search.employmentType && search.employmentType.trim()) checks.push(checkEmploymentType(listing, search.employmentType));

  const outcome: Outcome = checks.some((c) => c.outcome === "fail") ? "fail" : checks.some((c) => c.outcome === "review") ? "review" : "pass";
  return { searchId: search.id, label: search.label, outcome, checks };
}

export type Decision =
  | { decision: "accept"; searchId: string; searchLabel: string; reason: string }
  | { decision: "review"; searchId: string; searchLabel: string; reason: string; codes: string[] }
  | { decision: "reject"; code: string; reason: string };

function summarize(checks: Check[], outcome: Outcome): string {
  return checks
    .filter((c) => c.outcome === outcome)
    .map((c) => c.detail)
    .join("; ");
}

export function evaluateListing(listing: NormalizedListing, searches: SearchCriteria[]): Decision {
  if (!matchesDesignRole(listing.title)) {
    return { decision: "reject", code: "not_design_role", reason: "title isn't a UX/Product Design role" };
  }
  const verdicts = searches.map((s) => evaluateAgainstSearch(listing, s));

  const pass = verdicts.find((v) => v.outcome === "pass");
  if (pass) {
    return { decision: "accept", searchId: pass.searchId, searchLabel: pass.label, reason: `Matched "${pass.label}": ${summarize(pass.checks, "pass")}` };
  }
  const review = verdicts.find((v) => v.outcome === "review");
  if (review) {
    const codes = review.checks.filter((c) => c.outcome === "review").map((c) => c.code);
    return {
      decision: "review",
      searchId: review.searchId,
      searchLabel: review.label,
      codes,
      reason: `Needs review for "${review.label}": ${summarize(review.checks, "review")}`,
    };
  }
  // Rejected everywhere: report the closest search (fewest failed checks), first failed check in its order.
  const failCount = (v: SearchVerdict) => v.checks.filter((c) => c.outcome === "fail").length;
  const closest = [...verdicts].sort((a, b) => failCount(a) - failCount(b))[0];
  const firstFail = closest.checks.find((c) => c.outcome === "fail")!;
  return { decision: "reject", code: firstFail.code, reason: `Rejected for "${closest.label}": ${firstFail.detail}` };
}

/* ----------------------------------------------------------------------------------------- */
/* Source-level gates + planning                                                             */
/* ----------------------------------------------------------------------------------------- */

const AGGREGATOR_HOST_RE = /(^|\.)jobgether\.[a-z.]+$/i;

export function urlHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isAggregatorUrl(url: string | null | undefined): boolean {
  const host = urlHost(url);
  return host ? AGGREGATOR_HOST_RE.test(host) : false;
}

export function isSourceBlocked(source: Pick<SourceInfo, "excluded" | "exclusionOverride">): boolean {
  return Boolean(source.excluded) && !source.exclusionOverride;
}

/** Enabled searches that apply to this source's ATS. Disabled or deleted searches simply aren't in the list. */
export function applicableSearches(searches: SearchCriteria[], provider: string): SearchCriteria[] {
  return searches.filter((s) => s.enabled && (s.providers.length === 0 || s.providers.includes(provider)));
}

/** Enabled searches that don't say which country they're eligible for. While any exist, imports stay paused (staged rollout). */
export function searchesMissingCountry(searches: SearchCriteria[]): SearchCriteria[] {
  return searches.filter((s) => s.enabled && !(s.eligibleCountry && s.eligibleCountry.trim()));
}

export interface PlannedListing {
  listing: NormalizedListing;
  decision: Decision;
}

export interface DiscoveryPlan {
  accepted: PlannedListing[];
  review: PlannedListing[];
  rejected: PlannedListing[];
  rejectedCounts: Record<string, number>;
  reviewCounts: Record<string, number>;
}

function bump(map: Record<string, number>, key: string, by = 1) {
  map[key] = (map[key] ?? 0) + by;
}

export function planDiscovery(listings: NormalizedListing[], source: SourceInfo, allSearches: SearchCriteria[]): DiscoveryPlan {
  const plan: DiscoveryPlan = { accepted: [], review: [], rejected: [], rejectedCounts: {}, reviewCounts: {} };
  const reject = (listing: NormalizedListing, code: string, reason: string) => {
    plan.rejected.push({ listing, decision: { decision: "reject", code, reason } });
    bump(plan.rejectedCounts, code);
  };

  const blocked = isSourceBlocked(source);
  const enabledAny = allSearches.some((s) => s.enabled);
  const searches = applicableSearches(allSearches, source.provider);
  const missingCountry = searchesMissingCountry(allSearches);

  for (const listing of listings) {
    if (blocked) {
      reject(listing, "excluded_source", "source is excluded");
      continue;
    }
    if (!source.exclusionOverride && isAggregatorUrl(listing.url)) {
      reject(listing, "aggregator_url", `posting URL is hosted by an aggregator (${urlHost(listing.url)})`);
      continue;
    }
    if (searches.length === 0) {
      reject(listing, enabledAny ? "no_search_for_provider" : "no_enabled_search", enabledAny ? "no enabled saved search covers this ATS" : "no enabled saved search");
      continue;
    }
    if (missingCountry.length > 0) {
      reject(listing, "search_missing_country", `saved search "${missingCountry[0].label}" has no eligible country yet — imports are paused until every enabled search has one`);
      continue;
    }
    const decision = evaluateListing(listing, searches);
    if (decision.decision === "accept") plan.accepted.push({ listing, decision });
    else if (decision.decision === "review") {
      plan.review.push({ listing, decision });
      for (const code of decision.codes) bump(plan.reviewCounts, code);
    } else {
      plan.rejected.push({ listing, decision });
      bump(plan.rejectedCounts, decision.code);
    }
  }
  return plan;
}
