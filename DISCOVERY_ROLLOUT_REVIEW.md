# Discovery filtering rollout — review before production

Base: RWindsor/ux_career_command_center main, 8900d12ca444c6ac936b60e6a6540f2abca6f6c0.
Production: Vercel dpl_91jS2t7H55w59d3oCicaZ52Z3rBb, READY, same commit.
Inspected October 27, 2026. No repository AGENTS.md or CLAUDE.md found.

## Integrated changes

- Reconstructed revision 2 eligibility gate, saved-search controls, review queue, source exclusions, and default-paused discovery cron.
- Preserve current navigation/routes and Brave provider; no wholesale repository replacement.
- Correct new links/revalidation paths to /jobs and /discovery.
- Contradictory ATS metadata and description (remote/not-remote or US/Canada-only) now route to Needs review. Two added regression tests reproduce the previous incorrect acceptance. Live ATS checks also exposed country-name normalization (Ashby returns United States) and missing SmartRecruiters detail-page URLs; both are fixed with regression coverage.
- Manual Run now capped at 10 newly inserted jobs per source; scheduled runs unchanged apart from eligibility and pause gates.
- Clarify empty-country selection and remove Contract from suggested title exclusions.
- Test command uses node --import tsx to avoid unnecessary IPC socket creation.
- No bulk cleanup is included in the rollout. Existing maintenance tools are retained from the attachment but will not be executed.

## Verification

- npm ci --ignore-scripts: passed with lockfile.
- npm test: 34 passed locally, 0 failed, 8 skipped (42 total); prior commit passed all 40 tests against disposable PostgreSQL 16 in GitHub Actions; updated CI will verify the final 42.
- npx tsc --noEmit: passed.
- npm run build: passes with a dummy DATABASE_URL and AUTH_SECRET solely to initialize imports; no real DB connection. Authentication dependencies emit Edge compatibility warnings.
- Eight Postgres tests are unverified here: they require a disposable test DB and drop/recreate its public schema. Never use production or a production-data clone for that test harness.
- Live browser: current Discovery page accessible in user's signed-in Chrome. Current screens inspected; new screens await deployed/migrated preview verification.
- Live Lever, Ashby and SmartRecruiters API responses were inspected read-only; normalized real-board evaluation can run without DB writes. Neon, authenticated paused cron response and persisted import/review flow remain to verify.

## Observed live configuration

Three active searches: Contract UX Designer (LA-Based), Design System UX Designer (LA-Based), Product Designer (LA-Based).
Verified watched board: Lever / jobgether, label “Jobgether - UX Designer – Retail & Operational Systems (Lever)”. Latest visible run October 27: 57 matching, 4 new. Still Watching at inspection. No changes made to it yet.
DISCOVERY_CRON_ENABLED is absent in Vercel. IMPORTANT: current old code does not honor this switch. Its schedule has not been paused merely by inspecting it.

## Production changes requiring approval

1. Deploy prerequisite PR #2 (fix/discovery-rollout-pause, f88bb1848f585466c9f2cdf531f321ede04ae510) first: just the rollout helper and two cron guards, with no schema dependencies. The currently absent switch pauses scheduled discovery. Verify before migration. The whole website, manual actions and weekly report remain available.
2. Apply only explicit SQL migrations 0002 then 0003 in a short transaction with lock timeout, after checking schema. 0002 adds 13 columns and clears dangling saved-search references on source rows; 0003 adds eligible_state. No job values, notes, applications or prep records are updated. Do not run broad db:push against production.
3. Ensure DISCOVERY_CRON_ENABLED=false for production and preview. Deploy reviewed branch to preview, verify migrated schema/UI, then merge/deploy to production. Preview currently shares the same DATABASE_URL target metadata as production; do not run automatic test setup or test-data writes there.
4. Leave all old searches paused while creating replacement searches. Creating a search resolves boards and can immediately import, so keep one enabled country-less legacy search as a temporary import interlock while configuring, then disable that interlock only when all replacements are ready. Alternatively configure search rows via reviewed scoped SQL with imports paused.
5. Exclude the confirmed Lever/jobgether source, override off, and pause it. Retain its source row so resolver cannot re-add it.
6. Configure searches below; leave schedules paused. Restore selected legitimate watched boards as needed.
7. Run one verified employer source manually (max 10 new). Inspect accepted jobs' search/reason, source URLs, geography, CA eligibility and employment; inspect any actual Needs review entries. Do not approve ambiguous eligibility without reading the posting. Existing duplicate jobs can make the batch produce zero new rows; choose another small verified source rather than delete history.
8. Only after satisfactory real-flow checks, enable DISCOVERY_CRON_ENABLED=true and deploy. Verify resolver/ATS cron authorization and paused/resumed behavior. Keep Jobgether excluded. Monitor first scheduled run.

## Saved-search configuration

Common: US; California eligibility; all supported automated ATS providers; keywords Senior Product Designer, Sr. Product Designer, Senior UX Designer, Sr. UX Designer, Senior User Experience Designer, Senior Interaction Designer, Senior Product Design, Senior UX/UI Designer, Senior UI/UX Designer. Titles such as Staff/Principal/Lead should be reviewed separately because senior IC vs management is ambiguous.
Exclude Intern, Internship, Junior, Jr, Director, Manager, Head, VP, Vice President, Industrial, Hardware, Researcher, Content Designer. These are whole-word terms; lists cannot express precise role semantics.

| Search | Arrangement | Extra location | Employment filter |
|---|---|---|---|
| Senior Product/UX — US Remote (CA eligible) | Remote | blank | blank |
| Senior Product/UX — Los Angeles Hybrid | Hybrid | Los Angeles | blank |
| Senior Product/UX — Los Angeles Onsite | On-site | Los Angeles | blank |

Blank employment admits suitable permanent roles alongside contract/freelance/temp/contract-to-hire. Current UI accepts one employment type, not a multi-type OR; typing a comma-separated list would silently normalize to one type. This patch does not rank contract work above permanent jobs. Do not claim it does. Avoid a strict full-time filter because it sends full-time contracts to review. If contract-only views are desired later, separate contract and temporary searches may be used without broadening the main searches.
Location text is literal matching: “Los Angeles” may miss Santa Monica, Culver City, Burbank, etc. Add explicitly agreed city searches later; do not broaden to all California onsite roles.

## Rollback

- Keep discovery switch false; if needed restore previous READY production deployment.
- Leave additive columns in place; old code tolerates them. No DROP COLUMN or data rollback needed.
- Restore prior saved-search/watched-board enabled states only after deciding whether old unfiltered discovery should run again. Keep Jobgether paused unless explicitly requested otherwise.
- Existing notes, applications, prep and manually archived jobs stay intact.
