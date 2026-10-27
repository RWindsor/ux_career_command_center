# Discovery eligibility patch — REV 2 (RECONSTRUCTED)

> **This is a reconstruction, not the original revision 2.**
> The original rev 2 source, tests and notes could not be found: the ZIP you received earlier was byte-identical to rev 1
> (21 tests), and nothing else was available in this workspace. `TEST_RESULTS.txt` is a *report*; it does not contain code.
> I rebuilt each reported change on top of your rev 1 ZIP, using the test report and the round-2 requirements as the spec.
> Names, structure and edge-case choices below are **mine** and may differ from the lost original.
> Where the original behavior is unknown, I chose the conservative option (needs review rather than silently pass or reject).

**Not deployed. No live database was touched. No cleanup was run.** Everything below was run against a throwaway local
PostgreSQL 16.15 (not Neon) that was created for the tests and has no connection to your data.

## What was verified (independently, in this environment)

| Check | Result |
|---|---|
| Rev 1 ZIP as received: `npm test` / `tsc --noEmit` | 21 pass / clean |
| Rev 2 reconstruction, **with** local Postgres 16.15 (`TEST_DATABASE_URL` set) | **38 pass, 0 fail, 0 skipped** |
| Rev 2 reconstruction, **without** a database | 38 tests: 30 pass, 8 skipped (the DB tests auto-skip) |
| `npx tsc --noEmit` | clean (0 errors) |
| Rev 1 rule file + rev 2 regression tests (mutation check) | the REGRESSION tests fail → the three reported gaps are real and reproduced |
| Apply with row locks removed (mutation check) | both concurrency tests fail |
| Apply with SQL write guards removed (mutation check) | the "change after recheck" test fails |
| CLI end-to-end on the scratch DB: `preview` → wrong `--confirm` refused → `--rehearse` (0 rows persisted) → `apply` (2 rows) → printed undo SQL (2 rows restored) | worked as described |
| Migration `0003` | idempotent; adds the column when missing |

The test list deliberately mirrors the 38 names in your `TEST_RESULTS.txt` (21 from rev 1 + 9 new rule/rollout tests + 8 DB tests),
but I wrote these tests and this code myself, so matching names is **not** evidence that this is the same code.

**Not verified:** `next build` (not run; the rev 1 notes say fonts can't be fetched in the sandbox, and I did not attempt it),
anything against Neon itself, the UI changes in a browser, live ATS APIs, and the cron routes under Vercel.
Type-checking covers the UI/action changes; they are small and unrun.

## What changed vs rev 1

New files: `lib/discovery/maintenance.ts`, `lib/discovery/rollout.ts`, `lib/db/migrations/0003_discovery_rev2.sql`,
`tests/maintenance.db.test.ts`, `tests/helpers/test-db.ts`.
Changed: `lib/discovery/eligibility.ts`, `lib/discovery/cleanup.ts` (one `export`), `scripts/discovery-maintenance.ts`,
`lib/db/schema.ts`, `app/actions/{ats,saved-searches}.ts`, both discovery cron routes, the saved-search form/list,
the Jobs page, `.env.local.example`, `package.json` (adds `pg`, `@types/pg`), `tests/eligibility.test.ts`.

### 1. Remote negation (report gap 1)
`location "US"` + "This is not a remote role" used to be **accepted** by a remote-only search because the phrase "remote role" matched.
Now each statement is judged separately and negations are recognized ("not a remote role", "non-remote", "remote work is not available",
"we do not offer remote", "cannot be performed remotely"):
- explicit negation of the required arrangement → **reject**
- the posting says both remote *and* not remote → **needs review** (`arrangement_conflict`)
- "No remote work experience required" is deliberately **not** a negation.

### 2. California eligibility (report gap 2)
New optional per-search setting **State eligibility → California** (column `saved_searches.eligible_state`, value `CA`; **column name is my choice**).
- Explicit exclusion ("unable to hire in California", "all states except California", "California residents are not eligible") → reject
- Residency restricted to other states ("must reside in New York", list without CA) → reject
- Conflicting statements, "certain/select states" wording, or a location naming only another state → needs review
- California named in the location or the eligible-state list, or no restriction at all → pass
Only California is supported (minimal by design); any other value is flagged as a misconfigured search.
Also: a country label no longer overrides a narrower country restriction in the description
("Remote - US" + "must be located in Canada" → needs review, `geography_conflict`).

### 3. "Full-time contract" (report gap 3)
Hours (full/part-time) and employment relationship (contract/internship/temporary) are now judged separately.
- Contract/intern/temp search: passes whenever that relationship is stated, whatever the hours ("Full-time contract" passes a contract search).
- Full-/part-time search: a stated contract/intern/temp role is never a clean pass — matching hours → **needs review**, otherwise reject.
- Plain "Full-time" still rejects a contract search; plain "Contract" still rejects a full-time search (unchanged from rev 1).

### 4. Cleanup apply protections
Rev 1 `apply` re-checked only a few columns and printed the *requested* count as the "archived" count.
`lib/discovery/maintenance.ts › applyArchive` now, in one transaction:
1. sets `lock_timeout` (default 5 s, `--lock-timeout-ms`) — if any row stays locked, **everything rolls back**;
2. `SELECT … FOR UPDATE` on every previewed row (concurrent app writes and child inserts wait; an edit already in flight finishes first);
3. re-checks every protection from the locked rows and fresh child-table counts: edited since import, notes, offer compensation,
   duplicate review, match score, interview prep, offer prep, application package, status, discovery state, deleted;
4. runs a guarded `UPDATE` repeating the same protections in `WHERE` (so a change landing after step 3 still can't be overwritten);
5. reports the rows actually updated (from `RETURNING`), never sets `updated_at`, and prints exact undo SQL.
`--rehearse` does all of it and rolls back. The CLI now uses one direct `pg` connection for all modes (use Neon's **non-pooled** URL for apply).

### 5. Pausing scheduled imports (staged rollout)
- `/api/cron/ats-refresh` and `/api/cron/discovery-resolve` do nothing unless `DISCOVERY_CRON_ENABLED` is **exactly** `true`
  (`TRUE`, `1`, ` true` all stay paused). They return `{ paused: true }` after auth. The weekly-report cron is unaffected.
- Any import (including "Run now" and creating a search) is blocked while **any enabled** saved search has no eligible country.
- The Discovery warning text now says so; the Jobs page shows a **Needs review (N)** link when ambiguous imports are waiting
  (this came from the round-2 request, not from the test report).

## Order of operations (nothing below has been done for you)
1. Review the diff. `npm ci`, `npm test`, `npx tsc --noEmit`. Optionally run the DB tests against a *scratch* database:
   `TEST_DATABASE_URL=postgres://…/something_test npm test` — the DB name must contain "test" and its `public` schema is dropped and rebuilt.
2. Add the column **before deploying**: `npm run db:push` **or** run `lib/db/migrations/0003_discovery_rev2.sql` (additive; run one). If you never applied rev 1's `0002`, apply it first.
3. Leave `DISCOVERY_CRON_ENABLED` unset (paused). Deploy.
4. Discovery → each saved search → **Edit filters**: set Eligible country (and California, if wanted). Until every active search has a country, nothing imports.
5. Verify a small batch by hand: **Run now** on one watched source; check Needs review and the accepted jobs.
6. Only then set `DISCOVERY_CRON_ENABLED=true` in Vercel and redeploy.
7. Cleanup, when ready: `npm run discovery:preview` → read the CSV →
   `npx tsx scripts/discovery-maintenance.ts apply --manifest <json> --confirm <hash> --rehearse` → same command without `--rehearse`.

## Known limits
- All geography/arrangement/employment/state parsing is heuristic text matching on location, title and description; unusual phrasing can be missed.
  When unsure it routes to **needs review**, but "unsure" is only as good as the patterns.
- The California rule reads sentences it can recognize; phrases like "we hire in 38 states" won't resolve to a yes/no and will pass as "no restriction stated".
- ATS structured-field names (Lever/Ashby/SmartRecruiters) are still unverified against live APIs, as in rev 1.
- The concurrency tests prove behavior on PostgreSQL 16 with `READ COMMITTED` locking. Neon is PostgreSQL, so the same locking applies,
  but I could not test against Neon itself.
