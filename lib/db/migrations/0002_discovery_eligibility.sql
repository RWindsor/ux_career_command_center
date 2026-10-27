-- 0002_discovery_eligibility.sql
--
-- Additive only. Nothing is dropped, renamed, or narrowed. NO jobs are modified (no archiving, no backfill).
-- The only data write is clearing dangling saved-search links on watched sources (last statement).
-- Safe to re-run (IF NOT EXISTS).
-- `npm run db:push` picks up the same changes from lib/db/schema.ts — run ONE of the two.

-- saved_searches: the three new controls
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS eligible_country text;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS work_arrangement text;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS excluded_title_terms jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ats_watched_sources: source exclusion + last-run rejection counts
ALTER TABLE ats_watched_sources ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;
ALTER TABLE ats_watched_sources ADD COLUMN IF NOT EXISTS exclusion_reason text;
ALTER TABLE ats_watched_sources ADD COLUMN IF NOT EXISTS exclusion_override boolean NOT NULL DEFAULT false;
ALTER TABLE ats_watched_sources ADD COLUMN IF NOT EXISTS last_run_stats jsonb;

-- jobs: why a job qualified / needs review, which source made it, and system-archive marker
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS discovery_state text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS discovery_search_id uuid;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS discovery_reason text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS watched_source_id uuid;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS auto_archived_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS auto_archive_reason text;

-- Sources that were linked to a search that has since been deleted: clear the dangling link.
-- (Behavior no longer depends on this link — imports are gated by the user's enabled searches.)
UPDATE ats_watched_sources s
   SET discovered_via_search_id = NULL
 WHERE discovered_via_search_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM saved_searches q WHERE q.id = s.discovered_via_search_id);
