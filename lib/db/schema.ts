import { pgEnum, pgTable, text, timestamp, uuid, jsonb, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Application users. Passwords are hashed with bcrypt before insert —
 * never store plaintext (see app/actions/auth.ts).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * Phase 2 — Job Database
 */
/**
 * "saved", "interviewing", and "archived" are kept for backward
 * compatibility with existing rows written before the detailed pipeline
 * below was added — see lib/pipeline.ts for how legacy values are
 * bucketed into the new stage groups. New rows use the granular values.
 * New values are additive only (see lib/db/migrations/0001_pipeline_and_ats.sql,
 * which uses ALTER TYPE ... ADD VALUE) — nothing is renamed or removed,
 * so no existing row ever needs to change to stay valid.
 */
export const jobStatusEnum = pgEnum("job_status", [
  "saved", // legacy — pre-pipeline "not yet applied" bucket
  "discovered",
  "interested",
  "applying",
  "applied",
  "recruiter_screen",
  "hiring_manager_interview",
  "portfolio_review",
  "panel_interview",
  "final_round",
  "interviewing", // legacy — pre-pipeline generic "in interviews" bucket
  "offer",
  "rejected",
  "withdrawn",
  "archived", // legacy — pre-pipeline catch-all; still usable for manual archiving
]);

export const atsProviderEnum = pgEnum("ats_provider", [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workday",
  "manual",
]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    company: text("company").notNull(),
    jobUrl: text("job_url"),
    location: text("location"),
    /** Raw pasted job posting text — the source of truth the AI analysis runs against. */
    description: text("description").notNull(),
    status: jobStatusEnum("status").notNull().default("discovered"),
    notes: text("notes"),

    // --- ATS discovery / duplicate-detection provenance (additive) ---
    /** "manual" for user-pasted jobs; a specific ATS provider for discovered ones. */
    sourceName: atsProviderEnum("source_name").notNull().default("manual"),
    /** The posting's ID on its source ATS — used for exact-duplicate detection on re-import. */
    sourceJobId: text("source_job_id"),
    /** Canonical/stable URL from the source, when different from the user-facing jobUrl. */
    sourceUrl: text("source_url"),
    /** Lowercased/trimmed company, computed at write time — used for likely-duplicate matching. */
    normalizedCompany: text("normalized_company").notNull(),
    /** Lowercased/trimmed title, computed at write time — used for likely-duplicate matching. */
    normalizedTitle: text("normalized_title").notNull(),
    /** Set when this job is flagged as a likely duplicate of another job of the same user. */
    duplicateOfJobId: uuid("duplicate_of_job_id"),
    /** True once the user has explicitly said "keep as separate role" or "dismiss" for the flag above. */
    duplicateReviewed: boolean("duplicate_reviewed").notNull().default(false),

    /** Freeform compensation details the user enters once a job reaches the Offer stage. Never AI-generated. */
    offerCompensation: text("offer_compensation"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Exact-duplicate lookup on repeated ATS import runs.
    sourceLookupIdx: index("jobs_source_lookup_idx").on(table.userId, table.sourceName, table.sourceJobId),
    // Likely-duplicate / same-company lookup.
    dedupeLookupIdx: index("jobs_dedupe_lookup_idx").on(table.userId, table.normalizedCompany, table.normalizedTitle),
  })
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

/**
 * One row per Gemini analysis run for a job. Kept separate from `jobs`
 * (rather than columns on it) so a job can be re-analyzed later — e.g.
 * after a prompt or model change — without losing prior results.
 */
export const jobAnalyses = pgTable("job_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  /** Gemini model string used for this run, e.g. "gemini-2.5-flash". */
  model: text("model").notNull(),
  summary: text("summary").notNull(),
  seniorityLevel: text("seniority_level"),
  employmentType: text("employment_type"),
  yearsOfExperience: text("years_of_experience"),
  salaryRange: text("salary_range"),
  keyResponsibilities: jsonb("key_responsibilities").$type<string[]>().notNull(),
  requiredSkills: jsonb("required_skills").$type<string[]>().notNull(),
  niceToHaveSkills: jsonb("nice_to_have_skills").$type<string[]>().notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull(),
  /** Full parsed JSON from Gemini, kept for debugging/audit and future re-parsing. */
  rawResponse: jsonb("raw_response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JobAnalysis = typeof jobAnalyses.$inferSelect;
export type NewJobAnalysis = typeof jobAnalyses.$inferInsert;

/**
 * Resume Library — raw resume text a user has on file. Kept separate
 * from its AI extraction (below) for the same reason as jobs/job_analyses:
 * re-parsing shouldn't lose history, and a resume should exist even if
 * extraction fails.
 */
export const resumes = pgTable("resumes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** User-chosen label, e.g. "Product Design Resume v3". */
  label: text("label").notNull(),
  rawText: text("raw_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Resume = typeof resumes.$inferSelect;
export type NewResume = typeof resumes.$inferInsert;

/**
 * One row per Gemini extraction run for a resume — the structured data
 * (skills, experience) that Match Scoring compares against a job's
 * jobAnalyses row.
 */
export const resumeAnalyses = pgTable("resume_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  resumeId: uuid("resume_id")
    .notNull()
    .references(() => resumes.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  skills: jsonb("skills").$type<string[]>().notNull(),
  experienceSummary: text("experience_summary").notNull(),
  yearsOfExperience: text("years_of_experience"),
  jobTitlesHeld: jsonb("job_titles_held").$type<string[]>().notNull(),
  rawResponse: jsonb("raw_response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ResumeAnalysis = typeof resumeAnalyses.$inferSelect;
export type NewResumeAnalysis = typeof resumeAnalyses.$inferInsert;

/**
 * One row per Match Scoring run — a (job, resume) pair scored by
 * Gemini against each other's latest analyses. Multiple rows can exist
 * per pair (e.g. re-scored after a resume edit); callers show the
 * latest.
 */
export const jobMatches = pgTable("job_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  resumeId: uuid("resume_id")
    .notNull()
    .references(() => resumes.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  /** 0-100 fit score. */
  score: integer("score").notNull(),
  strengths: jsonb("strengths").$type<string[]>().notNull(),
  gaps: jsonb("gaps").$type<string[]>().notNull(),
  recommendations: jsonb("recommendations").$type<string[]>().notNull(),
  rawResponse: jsonb("raw_response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JobMatch = typeof jobMatches.$inferSelect;
export type NewJobMatch = typeof jobMatches.$inferInsert;

/**
 * Phase 5 — Interview Prep Center
 *
 * One row per Gemini-generated prep pack for a (job, resume) pairing.
 * Kept as append-only history like jobAnalyses/resumeAnalyses — callers
 * show the latest row for a job and can regenerate after a resume edit.
 */
export const interviewPreps = pgTable("interview_preps", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  resumeId: uuid("resume_id").references(() => resumes.id, { onDelete: "set null" }),
  model: text("model").notNull(),
  companyResearch: text("company_research").notNull(),
  /** [{ category, question }] — role-specific interview questions. */
  interviewQuestions: jsonb("interview_questions").$type<{ category: string; question: string }[]>().notNull(),
  /** [{ question, suggestedStory, resumeEvidence }] — STAR suggestions grounded in the resume. */
  starStories: jsonb("star_stories")
    .$type<{ question: string; suggestedStory: string; resumeEvidence: string }[]>()
    .notNull(),
  portfolioRecommendations: jsonb("portfolio_recommendations").$type<string[]>().notNull(),
  recruiterScreenPrep: jsonb("recruiter_screen_prep").$type<string[]>().notNull(),
  hiringManagerPrep: jsonb("hiring_manager_prep").$type<string[]>().notNull(),
  portfolioPresentationPrep: jsonb("portfolio_presentation_prep").$type<string[]>().notNull(),
  rawResponse: jsonb("raw_response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InterviewPrep = typeof interviewPreps.$inferSelect;
export type NewInterviewPrep = typeof interviewPreps.$inferInsert;

/**
 * Phase 6 — Recruiter / Contract CRM
 */
export const recruiterStatusEnum = pgEnum("recruiter_status", [
  "new",
  "contacted",
  "responded",
  "interviewing",
  "placed",
  "inactive",
]);

export const recruiterAgencies = pgTable("recruiter_agencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  website: text("website"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RecruiterAgency = typeof recruiterAgencies.$inferSelect;
export type NewRecruiterAgency = typeof recruiterAgencies.$inferInsert;

export const recruiterContacts = pgTable("recruiter_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agencyId: uuid("agency_id").references(() => recruiterAgencies.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  status: recruiterStatusEnum("status").notNull().default("new"),
  notes: text("notes"),
  lastContactedDate: timestamp("last_contacted_date", { withTimezone: true }),
  followUpDate: timestamp("follow_up_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RecruiterContact = typeof recruiterContacts.$inferSelect;
export type NewRecruiterContact = typeof recruiterContacts.$inferInsert;

/**
 * Freeform contact-history log for a recruiter contact — separate from
 * `notes` on the contact itself, which holds general/standing notes.
 */
export const recruiterContactHistory = pgTable("recruiter_contact_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => recruiterContacts.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  contactedAt: timestamp("contacted_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RecruiterContactHistoryEntry = typeof recruiterContactHistory.$inferSelect;
export type NewRecruiterContactHistoryEntry = typeof recruiterContactHistory.$inferInsert;

export const contractOpportunityStatusEnum = pgEnum("contract_opportunity_status", [
  "new",
  "submitted",
  "interviewing",
  "offer",
  "placed",
  "closed",
]);

export const contractOpportunities = pgTable("contract_opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  recruiterContactId: uuid("recruiter_contact_id").references(() => recruiterContacts.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  clientCompany: text("client_company"),
  rate: text("rate"),
  status: contractOpportunityStatusEnum("status").notNull().default("new"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContractOpportunity = typeof contractOpportunities.$inferSelect;
export type NewContractOpportunity = typeof contractOpportunities.$inferInsert;

/**
 * Phase 7 — Dashboard Analytics & Weekly Career Report
 *
 * One row per generated weekly report. `stats` snapshots the computed
 * metrics at generation time so past reports stay stable even as the
 * pipeline keeps changing.
 */
export const weeklyReports = pgTable("weekly_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
  summary: text("summary").notNull(),
  recommendations: jsonb("recommendations").$type<string[]>().notNull(),
  stats: jsonb("stats").notNull(),
  model: text("model").notNull(),
  rawResponse: jsonb("raw_response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WeeklyReport = typeof weeklyReports.$inferSelect;
export type NewWeeklyReport = typeof weeklyReports.$inferInsert;

/**
 * ATS Job Discovery
 *
 * A user configures which ATS-hosted job boards to watch (a Greenhouse
 * board token, a Lever/Ashby/SmartRecruiters company slug, etc.). The
 * source-adapter architecture in lib/ats/ fetches, normalizes, and
 * deduplicates listings from these against `jobs` on a schedule (Vercel
 * Cron, see app/api/cron/ats-refresh) or on demand.
 */
export const atsWatchedSources = pgTable("ats_watched_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: atsProviderEnum("provider").notNull(),
  /** The company/board identifier on that ATS, e.g. a Greenhouse board token or Lever site slug. */
  boardToken: text("board_token").notNull(),
  /** User-facing label, e.g. "Figma (Greenhouse)". */
  label: text("label").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  /** "success" | "error" | null (never run). */
  lastRunStatus: text("last_run_status"),
  lastRunError: text("last_run_error"),
  lastRunJobsFound: integer("last_run_jobs_found"),
  lastRunJobsNew: integer("last_run_jobs_new"),
  /** Set when this board was found automatically by a saved search's resolver run, rather than added by hand. */
  discoveredViaSearchId: uuid("discovered_via_search_id"),
  autoDiscovered: boolean("auto_discovered").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AtsWatchedSource = typeof atsWatchedSources.$inferSelect;
export type NewAtsWatchedSource = typeof atsWatchedSources.$inferInsert;

/**
 * Search-driven discovery (product brief section A, clarified).
 *
 * None of Greenhouse/Lever/Ashby/SmartRecruiters expose a public
 * cross-company "search all postings" endpoint — each only returns
 * postings for a board you already know the token of (see
 * lib/ats/*.ts). So "search-driven discovery" is implemented as two
 * steps: (1) resolve candidate company boards from the user's search
 * criteria via a web-search provider + ATS URL-pattern matching
 * (lib/discovery/board-resolver.ts), which upserts rows into
 * `atsWatchedSources` with `discoveredViaSearchId` set; (2) the
 * existing per-board fetch/normalize/dedupe/persist pipeline
 * (runDiscoveryForSource) then polls those boards like any other,
 * additionally filtered by this search's keywords/location/employment
 * type. See board-resolver.ts for the documented limitation and the
 * required web-search API configuration.
 */
export const savedSearches = pgTable("saved_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  /** Titles/keywords to search for, e.g. ["Product Designer", "UX Researcher"]. */
  keywords: jsonb("keywords").$type<string[]>().notNull(),
  /** Freeform location/remote preference, e.g. "Remote" or "New York, NY". Null = no location filter. */
  locationQuery: text("location_query"),
  /** Freeform employment type to match against listing text, e.g. "Full-time", "Contract". Null = no filter. */
  employmentType: text("employment_type"),
  /** Which ATS ecosystems to resolve boards from for this search. */
  providers: jsonb("providers").$type<AtsProviderValue[]>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastResolvedAt: timestamp("last_resolved_at", { withTimezone: true }),
  lastResolvedStatus: text("last_resolved_status"),
  lastResolvedError: text("last_resolved_error"),
  lastResolvedBoardsFound: integer("last_resolved_boards_found"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SavedSearch = typeof savedSearches.$inferSelect;
export type NewSavedSearch = typeof savedSearches.$inferInsert;
type AtsProviderValue = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workday";

/**
 * AI Application Assistant
 *
 * One row per generated application package for a (job, resume) pair —
 * append-only history like jobAnalyses/interviewPreps, so regenerating
 * never destroys a prior draft the user may still want.
 */
export const applicationPackages = pgTable("application_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  resumeId: uuid("resume_id")
    .notNull()
    .references(() => resumes.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  keywordGapAnalysis: jsonb("keyword_gap_analysis").$type<string[]>().notNull(),
  resumeTailoringRecommendations: jsonb("resume_tailoring_recommendations").$type<string[]>().notNull(),
  /** Existing resume evidence to foreground for this job — never invented experience. */
  experienceToForeground: jsonb("experience_to_foreground").$type<string[]>().notNull(),
  applicationStrategyNotes: text("application_strategy_notes").notNull(),
  coverLetterDraft: text("cover_letter_draft").notNull(),
  recruiterOutreachMessage: text("recruiter_outreach_message").notNull(),
  rawResponse: jsonb("raw_response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ApplicationPackage = typeof applicationPackages.$inferSelect;
export type NewApplicationPackage = typeof applicationPackages.$inferInsert;

/**
 * Offer, Negotiation & Onboarding Center
 *
 * One row per generated offer-prep pack for a job. `compensationContext`
 * echoes only what the user entered on the job (jobs.offerCompensation)
 * or what was already in the posting/analysis — Gemini is instructed to
 * never fabricate market compensation data (see lib/ai/prompts.ts).
 */
export const offerPreps = pgTable("offer_preps", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  compensationContext: text("compensation_context").notNull(),
  offerEvaluationChecklist: jsonb("offer_evaluation_checklist").$type<string[]>().notNull(),
  negotiationGuide: text("negotiation_guide").notNull(),
  questionsToAskBeforeAccepting: jsonb("questions_to_ask_before_accepting").$type<string[]>().notNull(),
  negotiationTalkingPoints: jsonb("negotiation_talking_points").$type<string[]>().notNull(),
  onboardingPlan30: jsonb("onboarding_plan_30").$type<string[]>().notNull(),
  onboardingPlan60: jsonb("onboarding_plan_60").$type<string[]>().notNull(),
  onboardingPlan90: jsonb("onboarding_plan_90").$type<string[]>().notNull(),
  rawResponse: jsonb("raw_response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OfferPrep = typeof offerPreps.$inferSelect;
export type NewOfferPrep = typeof offerPreps.$inferInsert;
