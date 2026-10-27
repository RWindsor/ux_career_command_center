import test, { after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { applyArchive, ApplyLockTimeoutError, evaluateStoredJobs, undoArchive } from "../lib/discovery/maintenance";
import { createHarness, seedChild, seedJob, sleep, TEST_URL, type Harness } from "./helpers/test-db";

/**
 * Real-PostgreSQL tests for cleanup evaluate/apply. They auto-skip unless TEST_DATABASE_URL is set.
 *   TEST_DATABASE_URL=postgres://user@localhost:5432/cc_test npm test
 * The target database's name must contain "test" — its public schema is dropped and rebuilt from lib/db/schema.ts.
 */
const skip = TEST_URL ? false : "TEST_DATABASE_URL not set";

let harness: Promise<Harness> | null = null;
const getH = () => (harness ??= createHarness());
after(async () => {
  if (harness) await (await harness).pool.end();
});

async function fresh(): Promise<Harness> {
  const h = await getH();
  await h.pool.query("TRUNCATE jobs CASCADE");
  return h;
}
async function statusOf(h: Harness, ids: string[]) {
  const rows = await h.db.select({ id: schema.jobs.id, status: schema.jobs.status, at: schema.jobs.autoArchivedAt }).from(schema.jobs).where(inArray(schema.jobs.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}
const items = (ids: string[], reason = "test reason") => ids.map((id) => ({ id, reason }));
function track<T>(p: Promise<T>) {
  const state = { done: false };
  p.then(() => (state.done = true), () => (state.done = true));
  return state;
}

test("evaluate: classifies archive / review / keep / protected from stored rows", { skip }, async () => {
  const h = await fresh();
  await h.pool.query("TRUNCATE saved_searches CASCADE");
  await h.db.insert(schema.savedSearches).values({
    userId: h.userId, label: "US remote", keywords: ["Product Designer"], employmentType: "Full-time", eligibleCountry: "US",
    workArrangement: "remote", excludedTitleTerms: [], providers: ["greenhouse"],
  });
  const archive = await seedJob(h, { location: "Remote - Canada" });
  const review = await seedJob(h, { location: "Remote" });
  const keep = await seedJob(h, { location: "Remote - US" });
  const prot = await seedJob(h, { location: "Remote - Canada", notes: "call recruiter" });

  const byId = new Map((await evaluateStoredJobs(h.db as never)).map((r) => [r.job.id, r]));
  assert.equal(byId.get(archive)!.bucket, "archive");
  assert.equal(byId.get(review)!.bucket, "review");
  assert.equal(byId.get(keep)!.bucket, "keep");
  assert.equal(byId.get(prot)!.bucket, "protected");
  // evaluate is read-only
  assert.equal((await statusOf(h, [archive])).get(archive)!.status, "discovered");
});

test("apply: archives exactly the previewed set, reports rows actually updated, leaves updated_at alone, undo restores", { skip }, async () => {
  const h = await fresh();
  const [a, b, c] = [await seedJob(h), await seedJob(h), await seedJob(h)];
  const outside = await seedJob(h);
  const before = await h.pool.query("SELECT id, updated_at FROM jobs ORDER BY id");

  const report = await applyArchive(h.db as never, items([a, b, c], "came from an excluded source"));
  assert.equal(report.requested, 3);
  assert.equal(report.updated, 3);
  assert.deepEqual(report.updatedIds.sort(), [a, b, c].sort());
  assert.equal(report.guardBlocked, 0);

  const s = await statusOf(h, [a, b, c, outside]);
  for (const id of [a, b, c]) assert.equal(s.get(id)!.status, "archived");
  assert.equal(s.get(outside)!.status, "discovered", "a job outside the previewed set is untouched");
  const reasons = await h.pool.query("SELECT DISTINCT auto_archive_reason FROM jobs WHERE status='archived'");
  assert.deepEqual(reasons.rows.map((r) => r.auto_archive_reason), ["Cleanup: came from an excluded source"]);

  const after = await h.pool.query("SELECT id, updated_at FROM jobs ORDER BY id");
  assert.deepEqual(after.rows, before.rows, "updated_at must not move");

  // The reported count comes from the database, not from the request size.
  const partial = await applyArchive(h.db as never, items([outside, a]), {}); // `a` is already archived
  assert.equal(partial.requested, 2);
  assert.equal(partial.updated, 1);
  assert.ok(partial.skipped.some((x) => x.id === a));

  assert.equal(await undoArchive(h.db as never, new Date(report.archivedAt)), 3);
  const restored = await statusOf(h, [a, b, c]);
  for (const id of [a, b, c]) {
    assert.equal(restored.get(id)!.status, "discovered");
    assert.equal(restored.get(id)!.at, null);
  }
});

test("apply: rechecks every protection at write time (edit, notes, compensation, duplicate review, match score, preps, package, status, delete)", { skip }, async () => {
  const h = await fresh();
  const mk = () => seedJob(h);
  const [edit, notes, comp, dup, match, interview, pkg, offer, status, deleted, control] = [await mk(), await mk(), await mk(), await mk(), await mk(), await mk(), await mk(), await mk(), await mk(), await mk(), await mk()];
  const all = [edit, notes, comp, dup, match, interview, pkg, offer, status, deleted, control];
  const preview = items(all); // the "preview" saw all of them as untouched

  // ...then the user keeps working before apply runs:
  await h.pool.query("UPDATE jobs SET updated_at = created_at + interval '1 minute' WHERE id=$1", [edit]);
  await h.pool.query("UPDATE jobs SET notes='call them' WHERE id=$1", [notes]);
  await h.pool.query("UPDATE jobs SET offer_compensation='$180k' WHERE id=$1", [comp]);
  await h.pool.query("UPDATE jobs SET duplicate_reviewed=true WHERE id=$1", [dup]);
  await seedChild(h, "job_matches", match);
  await seedChild(h, "interview_preps", interview);
  await seedChild(h, "application_packages", pkg);
  await seedChild(h, "offer_preps", offer);
  await h.pool.query("UPDATE jobs SET status='saved' WHERE id=$1", [status]);
  await h.pool.query("DELETE FROM jobs WHERE id=$1", [deleted]);

  const report = await applyArchive(h.db as never, preview);
  assert.equal(report.updated, 1);
  assert.deepEqual(report.updatedIds, [control]);
  assert.equal(report.skipped.length, 10);
  const why = new Map(report.skipped.map((x) => [x.id, x.reason]));
  assert.match(why.get(edit)!, /edited after import/);
  assert.match(why.get(notes)!, /notes/);
  assert.match(why.get(comp)!, /compensation/);
  assert.match(why.get(dup)!, /duplicate/);
  assert.match(why.get(match)!, /match score/);
  assert.match(why.get(interview)!, /interview prep/);
  assert.match(why.get(pkg)!, /application package/);
  assert.match(why.get(offer)!, /offer prep/);
  assert.match(why.get(status)!, /status is "saved"/);
  assert.match(why.get(deleted)!, /deleted/);
  const s = await statusOf(h, all.filter((id) => id !== deleted));
  assert.equal(s.get(control)!.status, "archived");
  for (const id of all.filter((x) => x !== control && x !== deleted)) assert.notEqual(s.get(id)!.status, "archived", id);
});

test("apply: SQL write guards stop a change that lands AFTER the recheck", { skip }, async () => {
  const h = await fresh();
  const [lateNotes, lateChild, lateStatus, control] = [await seedJob(h), await seedJob(h), await seedJob(h), await seedJob(h)];
  const report = await applyArchive(h.db as never, items([lateNotes, lateChild, lateStatus, control]), {
    hooks: {
      // Simulates a write sneaking in between the recheck and the UPDATE (inside the same transaction, so locks can't stop it).
      afterRecheck: async (tx) => {
        await tx.execute(`UPDATE jobs SET notes='late note' WHERE id='${lateNotes}'` as never);
        await tx.execute(`INSERT INTO job_matches (job_id, resume_id, model, score, strengths, gaps, recommendations, raw_response)
                          SELECT '${lateChild}', id, 'm', 1, '[]', '[]', '[]', '{}' FROM resumes LIMIT 1` as never);
        await tx.execute(`UPDATE jobs SET status='applied' WHERE id='${lateStatus}'` as never);
      },
    },
  });
  assert.equal(report.attempted, 4, "all four passed the recheck");
  assert.equal(report.updated, 1, "only the untouched one is written");
  assert.equal(report.guardBlocked, 3);
  assert.deepEqual(report.updatedIds, [control]);
  const s = await statusOf(h, [lateNotes, lateChild, lateStatus, control]);
  assert.equal(s.get(control)!.status, "archived");
  assert.equal(s.get(lateNotes)!.status, "discovered");
  assert.equal(s.get(lateChild)!.status, "discovered");
  assert.equal(s.get(lateStatus)!.status, "applied");
});

test("apply --rehearse: does all the work, reports rows, then rolls back", { skip }, async () => {
  const h = await fresh();
  const ids = [await seedJob(h), await seedJob(h), await seedJob(h)];
  const protectedId = await seedJob(h, { notes: "mine" });
  const report = await applyArchive(h.db as never, items([...ids, protectedId]), { rehearse: true });
  assert.equal(report.rehearsed, true);
  assert.equal(report.updated, 3, "reports the rows it WOULD change");
  assert.equal(report.skipped.length, 1);
  const rows = await h.pool.query("SELECT count(*)::int AS n FROM jobs WHERE status='archived' OR auto_archived_at IS NOT NULL");
  assert.equal(rows.rows[0].n, 0, "nothing persisted");
});

test("concurrency: an app write started during apply waits for the row lock; a child insert (FK) waits too", { skip }, async () => {
  const h = await fresh();
  const [a, b] = [await seedJob(h), await seedJob(h)];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let locked!: () => void;
  const lockedP = new Promise<void>((r) => (locked = r));

  const applyP = applyArchive(h.db as never, items([a, b]), { hooks: { afterLock: async () => { locked(); await gate; } } });
  await lockedP; // apply now holds FOR UPDATE on both rows and is paused

  const edit = h.pool.query("UPDATE jobs SET notes='hello' WHERE id=$1", [a]);
  const child = seedChild(h, "job_matches", b);
  const editState = track(edit);
  const childState = track(child);
  await sleep(500);
  try {
    assert.equal(editState.done, false, "the app's UPDATE is waiting on apply's row lock");
    assert.equal(childState.done, false, "the child INSERT (FK key-share lock) is waiting too");
  } finally {
    release(); // always let apply finish, even if an assertion above failed
  }
  const report = await applyP;
  assert.equal(report.updated, 2, "apply saw both rows as untouched — the late writes could not slip in first");
  await Promise.all([edit, child]);
  assert.equal(editState.done && childState.done, true, "both writes complete once apply commits");
});

test("concurrency: a user edit that is already in flight when apply starts is respected (apply waits, rechecks, skips)", { skip }, async () => {
  const h = await fresh();
  const [mine, other] = [await seedJob(h), await seedJob(h)];
  const user = await h.pool.connect();
  try {
    await user.query("BEGIN");
    await user.query("UPDATE jobs SET notes='keep this' WHERE id=$1", [mine]); // edit in flight, uncommitted

    const applyP = applyArchive(h.db as never, items([mine, other]));
    const state = track(applyP);
    await sleep(400);
    assert.equal(state.done, false, "apply is waiting for the user's row lock");

    await user.query("COMMIT");
    const report = await applyP;
    assert.equal(report.updated, 1);
    assert.deepEqual(report.updatedIds, [other]);
    assert.match(report.skipped.find((x) => x.id === mine)!.reason, /notes/);
    assert.equal((await statusOf(h, [mine])).get(mine)!.status, "discovered");
  } finally {
    user.release();
  }
});

test("apply: if a row stays locked past lock_timeout the whole apply rolls back (nothing archived)", { skip }, async () => {
  const h = await fresh();
  const ids = [await seedJob(h), await seedJob(h), await seedJob(h)];
  const holder = await h.pool.connect();
  try {
    await holder.query("BEGIN");
    const victim = [...ids].sort()[2]; // locked last, so earlier rows are already held when the timeout hits
    await holder.query("SELECT id FROM jobs WHERE id=$1 FOR UPDATE", [victim]);

    await assert.rejects(applyArchive(h.db as never, items(ids), { lockTimeoutMs: 300 }), ApplyLockTimeoutError);
    await holder.query("ROLLBACK");
  } finally {
    holder.release();
  }
  const rows = await h.pool.query("SELECT count(*)::int AS n FROM jobs WHERE status='archived'");
  assert.equal(rows.rows[0].n, 0, "all-or-nothing");
  const again = await applyArchive(h.db as never, items(ids));
  assert.equal(again.updated, 3, "once the lock is gone the same apply succeeds");
});
