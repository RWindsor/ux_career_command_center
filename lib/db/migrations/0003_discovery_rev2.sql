-- 0003_discovery_rev2.sql  (RECONSTRUCTED — see DISCOVERY_PATCH_NOTES_REV2.md)
--
-- Additive only. No jobs are modified. Safe to re-run.
-- `npm run db:push` picks up the same change from lib/db/schema.ts — run ONE of the two, BEFORE deploying.
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS eligible_state text;
