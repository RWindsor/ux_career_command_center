-- 0001_pipeline_and_ats.sql
--
-- Additive-only migration for: the detailed application pipeline, ATS
-- job discovery (source adapters + search-driven board resolution),
-- duplicate detection, the AI Application Assistant, and the Offer /
-- Negotiation / Onboarding Center.
--
-- Nothing here renames, drops, or narrows an existing column, table, or
-- enum value — every existing row stays valid without being touched.
-- Safe to run against the live database. Also safe to run more than
-- once except where noted (guarded with IF NOT EXISTS / DO blocks).
--
-- This project has been managed with `drizzle-kit push` up to this
-- point (no tracked migration history exists yet), so `npm run db:push`
-- is the primary, already-familiar way to apply this schema — it will
-- pick up the same additive changes from lib/db/schema.ts. This file is
-- provided as an explicit, auditable alternative (or for anyone who'd
-- rather review exact SQL before running it against a production
-- database). Run ONE of the two, not both back-to-back in a way that
-- fights itself — either is fine on its own.

-- === 1. Expand job_status with the detailed pipeline (additive) ===
-- Existing values (saved, applied, interviewing, offer, rejected,
-- archived) are untouched and kept as legacy buckets — see
-- lib/pipeline.ts for how the UI displays them.
DO $$
BEGIN
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'discovered';
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'interested';
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'applying';
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'recruiter_screen';
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'hiring_manager_interview';
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'portfolio_review';
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'panel_interview';
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'final_round';
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'withdrawn';
END $$;

-- === 2. ATS provider enum (new) ===
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ats_provider') THEN
    CREATE TYPE ats_provider AS ENUM ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday', 'manual');
  END IF;
END $$;

-- === 3. jobs — ATS provenance, duplicate detection, offer compensation ===
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_name ats_provider NOT NULL DEFAULT 'manual';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_job_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS duplicate_of_job_id uuid;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS duplicate_reviewed boolean NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS offer_compensation text;

-- normalized_company / normalized_title need per-row values derived from
-- existing data, so these go in three steps rather than a single
-- DEFAULT: add nullable, backfill every existing row, then enforce
-- NOT NULL once nothing is left null.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS normalized_company text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS normalized_title text;
UPDATE jobs SET normalized_company = lower(trim(company)) WHERE normalized_company IS NULL;
UPDATE jobs SET normalized_title = lower(trim(title)) WHERE normalized_title IS NULL;
ALTER TABLE jobs ALTER COLUMN normalized_company SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN normalized_title SET NOT NULL;

-- New rows now default to "discovered" instead of "saved" — existing rows are untouched.
ALTER TABLE jobs ALTER COLUMN status SET DEFAULT 'discovered';

CREATE INDEX IF NOT EXISTS jobs_source_lookup_idx ON jobs (user_id, source_name, source_job_id);
CREATE INDEX IF NOT EXISTS jobs_dedupe_lookup_idx ON jobs (user_id, normalized_company, normalized_title);

-- === 4. ats_watched_sources (new) ===
CREATE TABLE IF NOT EXISTS ats_watched_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider ats_provider NOT NULL,
  board_token text NOT NULL,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_run_status text,
  last_run_error text,
  last_run_jobs_found integer,
  last_run_jobs_new integer,
  discovered_via_search_id uuid,
  auto_discovered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- === 5. saved_searches (new) — search-driven discovery criteria ===
CREATE TABLE IF NOT EXISTS saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,
  keywords jsonb NOT NULL,
  location_query text,
  employment_type text,
  providers jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_resolved_at timestamptz,
  last_resolved_status text,
  last_resolved_error text,
  last_resolved_boards_found integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- === 6. application_packages (new) — AI Application Assistant ===
CREATE TABLE IF NOT EXISTS application_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  model text NOT NULL,
  keyword_gap_analysis jsonb NOT NULL,
  resume_tailoring_recommendations jsonb NOT NULL,
  experience_to_foreground jsonb NOT NULL,
  application_strategy_notes text NOT NULL,
  cover_letter_draft text NOT NULL,
  recruiter_outreach_message text NOT NULL,
  raw_response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- === 7. offer_preps (new) — Offer / Negotiation / Onboarding Center ===
CREATE TABLE IF NOT EXISTS offer_preps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  model text NOT NULL,
  compensation_context text NOT NULL,
  offer_evaluation_checklist jsonb NOT NULL,
  negotiation_guide text NOT NULL,
  questions_to_ask_before_accepting jsonb NOT NULL,
  negotiation_talking_points jsonb NOT NULL,
  onboarding_plan_30 jsonb NOT NULL,
  onboarding_plan_60 jsonb NOT NULL,
  onboarding_plan_90 jsonb NOT NULL,
  raw_response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
