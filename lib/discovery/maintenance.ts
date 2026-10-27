import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { boardTokenFromUrl, classifyStoredJob, protectedReason, TOUCH_WINDOW_MS, type Bucket, type JobActivity, type StoredJob } from "@/lib/discovery/cleanup";
import type { SearchCriteria } from "@/lib/discovery/eligibility";

/**
 * Cleanup maintenance (evaluate = read-only; apply = the ONLY writer, archive-only, fully reversible).
 * Kept out of the CLI script so it can be tested against a real Postgres.
 *
 * Imports go through "@/..." so this file must only be imported by code that has that alias (Next, tsx via tsconfig paths).
 */

export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;
type Tx = Parameters<Parameters<AnyDb["transaction"]>[0]>[0];

const { jobs, atsWatchedSources, savedSearches, jobMatches, applicationPackages, interviewPreps, offerPreps } = schema;

/** node-postgres returns { rows }, neon-http returns { rows } too; some drivers return the array itself. */
function rowsOf<T = Record<string, unknown>>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] })?.rows ?? []) as T[];
}

export const EMPTY_ACTIVITY: JobActivity = { matches: 0, applicationPackages: 0, interviewPreps: 0, offerPreps: 0 };

export function manifestHash(ids: string[]): string {
  return createHash("sha256").update([...ids].sort().join("\n")).digest("hex").slice(0, 16);
}

/* ------------------------------------------------------------------------------------------ */
/* evaluate (read-only)                                                                       */
/* ------------------------------------------------------------------------------------------ */

export type StoredRow = typeof jobs.$inferSelect;
export interface EvaluatedJob {
  job: StoredRow;
  bucket: Bucket;
  code: string;
  reason: string;
  sourceLabel: string;
}

export function toCriteria(r: typeof savedSearches.$inferSelect): SearchCriteria {
  return {
    id: r.id,
    label: r.label,
    enabled: r.enabled,
    keywords: r.keywords,
    locationQuery: r.locationQuery,
    employmentType: r.employmentType,
    eligibleCountry: r.eligibleCountry,
    eligibleState: r.eligibleState,
    workArrangement: r.workArrangement,
    excludedTitleTerms: r.excludedTitleTerms ?? [],
    providers: r.providers as string[],
  };
}

export async function loadActivity(db: AnyDb): Promise<Map<string, JobActivity>> {
  const byJob = new Map<string, JobActivity>();
  const bump = (id: string, key: keyof JobActivity) => {
    const a = byJob.get(id) ?? { ...EMPTY_ACTIVITY };
    a[key] += 1;
    byJob.set(id, a);
  };
  for (const r of await db.select({ id: jobMatches.jobId }).from(jobMatches)) bump(r.id, "matches");
  for (const r of await db.select({ id: applicationPackages.jobId }).from(applicationPackages)) bump(r.id, "applicationPackages");
  for (const r of await db.select({ id: interviewPreps.jobId }).from(interviewPreps)) bump(r.id, "interviewPreps");
  for (const r of await db.select({ id: offerPreps.jobId }).from(offerPreps)) bump(r.id, "offerPreps");
  return byJob;
}

/** Classifies every stored job against today's rules. Never writes. */
export async function evaluateStoredJobs(db: AnyDb): Promise<EvaluatedJob[]> {
  const sources = await db.select().from(atsWatchedSources);
  const allJobs = await db.select().from(jobs);
  const searchRows = await db.select().from(savedSearches);
  const activity = await loadActivity(db);

  return allJobs.map((job) => {
    const searches = searchRows.filter((s) => s.userId === job.userId).map(toCriteria);
    const mine = sources.filter((s) => s.userId === job.userId);
    const byId = job.watchedSourceId ? mine.find((s) => s.id === job.watchedSourceId) : undefined;
    const t = boardTokenFromUrl(job.jobUrl ?? job.sourceUrl);
    const byUrl = t ? mine.find((s) => s.provider === t.provider && s.boardToken.toLowerCase() === t.token) : undefined;
    const source = byId ?? byUrl ?? null;

    const c = classifyStoredJob(job as StoredJob, activity.get(job.id) ?? EMPTY_ACTIVITY, {
      searches,
      source: source ? { provider: source.provider, excluded: source.excluded, exclusionOverride: source.exclusionOverride } : null,
    });
    return { job, bucket: c.bucket, code: c.code, reason: c.reason, sourceLabel: source ? `${source.label} [${source.boardToken}]` : "(unlinked)" };
  });
}

/* ------------------------------------------------------------------------------------------ */
/* apply (archive-only)                                                                       */
/* ------------------------------------------------------------------------------------------ */

export interface ArchiveItem {
  id: string;
  reason: string;
}

export interface ApplyHooks {
  /** Runs inside the transaction right after every row is locked (tests use it to hold the locks open). */
  afterLock?: (tx: Tx) => Promise<void>;
  /** Runs inside the transaction after the recheck and before the write (tests use it to simulate a late change). */
  afterRecheck?: (tx: Tx) => Promise<void>;
}

export interface ApplyOptions {
  /** Do all the work, report real row counts, then ROLL BACK. */
  rehearse?: boolean;
  /** If any row stays locked longer than this, the WHOLE apply rolls back. Default 5000. */
  lockTimeoutMs?: number;
  archivedAt?: Date;
  hooks?: ApplyHooks;
}

export interface ApplyReport {
  requested: number;
  /** Rows dropped by the write-time recheck, with the reason. */
  skipped: { id: string; reason: string }[];
  /** Rows that passed the recheck and were sent to the guarded UPDATE. */
  attempted: number;
  /** Rows the guarded UPDATE actually changed (from RETURNING, not from the request size). */
  updated: number;
  updatedIds: string[];
  /** attempted − updated: rows an SQL guard stopped even after the recheck. */
  guardBlocked: number;
  rehearsed: boolean;
  archivedAt: string;
  undoSql: string;
}

class Rehearsal extends Error {}
export class ApplyLockTimeoutError extends Error {
  constructor(ms: number) {
    super(`Could not lock every row within ${ms} ms (something else is writing them). The whole apply was rolled back — nothing was archived. Try again in a minute.`);
  }
}

function pgCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code ?? err?.cause?.code;
}

/** Exact inverse of apply: archive never touches updated_at, so restoring status + markers is lossless. */
export function undoSqlFor(archivedAt: Date): string {
  return `UPDATE jobs SET status = 'discovered', auto_archived_at = NULL, auto_archive_reason = NULL WHERE auto_archived_at = '${archivedAt.toISOString()}';`;
}

export async function undoArchive(db: AnyDb, archivedAt: Date): Promise<number> {
  const res = await db
    .update(jobs)
    .set({ status: "discovered", autoArchivedAt: null, autoArchiveReason: null })
    .where(eq(jobs.autoArchivedAt, archivedAt))
    .returning({ id: jobs.id });
  return res.length;
}

const blank = (col: typeof jobs.notes | typeof jobs.offerCompensation) => or(isNull(col), sql`btrim(${col}) = ''`);
const noChild = (table: string) => sql`NOT EXISTS (SELECT 1 FROM ${sql.raw(table)} c WHERE c.job_id = ${jobs.id})`;

/**
 * Archives exactly the previewed ids — but only those that are STILL untouched at write time.
 *
 *  1. one transaction; lock_timeout set so a stuck row aborts everything instead of hanging
 *  2. SELECT … FOR UPDATE on every id, in id order. Concurrent edits and child inserts (FK) now wait for us;
 *     an edit already in flight finishes first and we see its result.
 *  3. recheck EVERY protection from the locked rows + fresh child-table counts (status, edits, notes, compensation,
 *     duplicate review, match score, preps, application package, deleted rows)
 *  4. guarded UPDATE: the same protections are repeated in the WHERE clause, so a change that lands after step 3
 *     still can't be overwritten. updated_at is never set, so undo is exact.
 *  5. RETURNING gives the real changed-row count
 */
export async function applyArchive(db: AnyDb, items: ArchiveItem[], options: ApplyOptions = {}): Promise<ApplyReport> {
  const archivedAt = options.archivedAt ?? new Date();
  const lockMs = options.lockTimeoutMs ?? 5000;
  const reasonById = new Map(items.map((i) => [i.id, i.reason]));
  const ids = [...reasonById.keys()].sort();

  const report: ApplyReport = {
    requested: ids.length,
    skipped: [],
    attempted: 0,
    updated: 0,
    updatedIds: [],
    guardBlocked: 0,
    rehearsed: Boolean(options.rehearse),
    archivedAt: archivedAt.toISOString(),
    undoSql: undoSqlFor(archivedAt),
  };
  if (ids.length === 0) return report;

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('lock_timeout', ${`${lockMs}ms`}, true)`);

      const locked = await tx.select().from(jobs).where(inArray(jobs.id, ids)).orderBy(jobs.id).for("update");
      await options.hooks?.afterLock?.(tx);

      const lockedIds = new Set(locked.map((j) => j.id));
      for (const id of ids) if (!lockedIds.has(id)) report.skipped.push({ id, reason: "deleted since the preview" });

      // Fresh child-table counts, read AFTER the locks are held.
      const activity = new Map<string, JobActivity>();
      if (locked.length > 0) {
        const counts = rowsOf<{ id: string; matches: number; packages: number; interview: number; offer: number }>(
          await tx.execute(sql`
            SELECT j.id,
                   (SELECT count(*) FROM job_matches m WHERE m.job_id = j.id)::int AS matches,
                   (SELECT count(*) FROM application_packages a WHERE a.job_id = j.id)::int AS packages,
                   (SELECT count(*) FROM interview_preps i WHERE i.job_id = j.id)::int AS interview,
                   (SELECT count(*) FROM offer_preps o WHERE o.job_id = j.id)::int AS offer
              FROM jobs j WHERE j.id IN (${sql.join(locked.map((j) => sql`${j.id}`), sql`, `)})`)
        );
        for (const c of counts) activity.set(c.id, { matches: c.matches, applicationPackages: c.packages, interviewPreps: c.interview, offerPreps: c.offer });
      }

      const keep: string[] = [];
      for (const job of locked) {
        if (job.autoArchivedAt) { report.skipped.push({ id: job.id, reason: "already archived by cleanup" }); continue; }
        if (job.discoveryState) { report.skipped.push({ id: job.id, reason: "now carries a discovery state" }); continue; }
        const why = protectedReason(job as StoredJob, activity.get(job.id) ?? EMPTY_ACTIVITY);
        if (why) { report.skipped.push({ id: job.id, reason: why }); continue; }
        keep.push(job.id);
      }
      report.attempted = keep.length;

      await options.hooks?.afterRecheck?.(tx);

      // Guarded write — one UPDATE per reason string.
      const byReason = new Map<string, string[]>();
      for (const id of keep) byReason.set(reasonById.get(id)!, [...(byReason.get(reasonById.get(id)!) ?? []), id]);
      for (const [reason, group] of byReason) {
        for (let i = 0; i < group.length; i += 500) {
          const chunk = group.slice(i, i + 500);
          const done = await tx
            .update(jobs)
            .set({ status: "archived", autoArchivedAt: archivedAt, autoArchiveReason: `Cleanup: ${reason}`.slice(0, 500) })
            .where(
              and(
                inArray(jobs.id, chunk),
                eq(jobs.status, "discovered"),
                isNull(jobs.discoveryState),
                isNull(jobs.autoArchivedAt),
                blank(jobs.notes),
                blank(jobs.offerCompensation),
                eq(jobs.duplicateReviewed, false),
                sql`${jobs.sourceName} <> 'manual'`,
                sql`(${jobs.updatedAt} - ${jobs.createdAt}) <= ${sql.raw(`interval '${TOUCH_WINDOW_MS / 1000} seconds'`)}`,
                noChild("job_matches"),
                noChild("application_packages"),
                noChild("interview_preps"),
                noChild("offer_preps")
              )
            )
            .returning({ id: jobs.id });
          report.updated += done.length;
          report.updatedIds.push(...done.map((d) => d.id));
        }
      }
      report.guardBlocked = report.attempted - report.updated;

      if (options.rehearse) throw new Rehearsal();
    });
  } catch (e) {
    if (e instanceof Rehearsal) return report;
    if (pgCode(e) === "55P03") throw new ApplyLockTimeoutError(lockMs);
    throw e;
  }
  return report;
}
