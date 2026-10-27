/**
 * Discovery maintenance — READ-ONLY by default.
 *
 *   npm run discovery:audit            Which watched sources are importing Jobgether listings? (read-only)
 *   npm run discovery:preview          What WOULD be archived under the new rules? (read-only; writes a CSV + manifest)
 *   npx tsx scripts/discovery-maintenance.ts apply --manifest <file> --confirm <hash> [--rehearse] [--lock-timeout-ms 5000]
 *                                      Archives exactly the previewed set. Deliberately NOT an npm script.
 *                                      --rehearse does every step (locks, rechecks, guarded UPDATE, real row counts) and then ROLLS BACK.
 *                                      Run a rehearsal first. Apply uses a direct `pg` connection because it needs a real transaction.
 *
 * Needs DATABASE_URL (reads .env.local). Uses one direct `pg` connection (Neon's non-pooled URL is ideal for apply). `audit --live` also fetches each flagged board's public
 * listings to show real posting URLs. Nothing is deleted, ever: apply only sets status = 'archived'
 * plus auto_archived_at / auto_archive_reason, so it is fully reversible (see the undo SQL it prints).
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";

config({ path: ".env.local" });
config(); // fall back to .env

type Row = Record<string, unknown>;
let pool: import("pg").Pool | undefined;

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const mode = process.argv[2];
  if (!["audit", "preview", "apply"].includes(mode ?? "")) {
    console.log("Usage: discovery-maintenance.ts <audit|preview|apply> [--live] [--manifest f --confirm hash]");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (checked .env.local and .env).");

  // One direct pg connection for every mode (works for Neon and local Postgres; apply needs real transactions).
  // Dynamic imports so DATABASE_URL is loaded first.
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("../lib/db/schema");
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const db = drizzle(pool, { schema });
    const { ATS_ADAPTERS } = await import("../lib/ats");
  const { boardTokenFromUrl } = await import("../lib/discovery/cleanup");
  const { evaluateStoredJobs, applyArchive, manifestHash } = await import("../lib/discovery/maintenance");
  const { isAggregatorUrl, urlHost } = await import("../lib/discovery/eligibility");
  const { jobs, atsWatchedSources } = schema;

  const sources = await db.select().from(atsWatchedSources);
  const allJobs = await db.select().from(jobs);

  /* ------------------------------------------------------------------ audit */
  if (mode === "audit") {
    const live = process.argv.includes("--live");
    const flagged: string[] = [];
    console.log("\n=== Watched sources: Jobgether signals ===\n");
    console.log("Four independent signals per source (do NOT trust any one alone):");
    console.log("  token/label : board token or label contains 'jobgether'");
    console.log("  url-host    : imported jobs whose posting URL host is jobgether.*");
    console.log("  url-token   : imported jobs whose ATS URL path token is 'jobgether'");
    console.log("  desc        : imported jobs whose description mentions 'jobgether'\n");

    for (const source of sources) {
      const mine = allJobs.filter((j) => {
        if (j.watchedSourceId === source.id) return true;
        const t = boardTokenFromUrl(j.jobUrl ?? j.sourceUrl);
        return t && t.provider === j.sourceName && t.provider === source.provider && t.token === source.boardToken.toLowerCase();
      });
      const tokenLabel = /jobgether/i.test(source.boardToken) || /jobgether/i.test(source.label);
      const urlHost_ = mine.filter((j) => isAggregatorUrl(j.jobUrl) || isAggregatorUrl(j.sourceUrl)).length;
      const urlToken = allJobs.filter((j) => j.sourceName === source.provider && boardTokenFromUrl(j.jobUrl ?? j.sourceUrl)?.token === "jobgether" && source.boardToken.toLowerCase() === "jobgether").length;
      const desc = mine.filter((j) => /jobgether/i.test(j.description)).length;
      const hit = tokenLabel || urlHost_ > 0 || urlToken > 0 || desc > 0;
      if (hit) flagged.push(source.id);

      console.log(
        `${hit ? "⚠" : " "} ${source.provider.padEnd(15)} ${source.boardToken.padEnd(28)} jobs=${String(mine.length).padStart(4)} ` +
          `token/label=${tokenLabel ? "YES" : "no "} url-host=${urlHost_} url-token=${urlToken} desc=${desc} ` +
          `auto=${source.autoDiscovered} enabled=${source.enabled} excluded=${source.excluded}  label="${source.label}"`
      );

      if (hit) {
        const sample = mine.filter((j) => j.jobUrl).slice(0, 3);
        for (const j of sample) console.log(`      sample: ${urlHost(j.jobUrl) ?? "?"}  ${j.jobUrl}  — "${j.title}" / company shown: "${j.company}"`);
        if (live) {
          try {
            const listings = await ATS_ADAPTERS[source.provider as keyof typeof ATS_ADAPTERS].fetchListings(source.boardToken);
            const hosts = new Map<string, number>();
            for (const l of listings) hosts.set(urlHost(l.url) ?? "none", (hosts.get(urlHost(l.url) ?? "none") ?? 0) + 1);
            console.log(`      live: ${listings.length} listings; URL hosts: ${[...hosts].map(([h, n]) => `${h}×${n}`).join(", ")}`);
            for (const l of listings.slice(0, 3)) console.log(`      live sample: ${l.url} — "${l.title}" @ ${l.location ?? "no location"}`);
          } catch (e) {
            console.log(`      live fetch failed: ${(e as Error).message}`);
          }
        }
      }
    }

    console.log(`\n${flagged.length} source(s) flagged. Review the evidence above, then — only for sources you have verified — exclude via`);
    console.log("the Discovery page (Exclude button) or this SQL (NOT executed by this script):\n");
    if (flagged.length) {
      console.log(
        `UPDATE ats_watched_sources SET excluded = true, enabled = false, exclusion_reason = 'Jobgether aggregator (verified)', updated_at = now()\n WHERE id IN (${flagged.map((id) => `'${id}'`).join(", ")});`
      );
    }
    return;
  }

  /* ---------------------------------------------------- preview / apply */
  const results = await evaluateStoredJobs(db as never);
  type Result = (typeof results)[number];

  const archive = results.filter((r) => r.bucket === "archive");
  const hash = manifestHash;

  if (mode === "preview") {
    const count = (b: string) => results.filter((r) => r.bucket === b).length;
    console.log("\n=== Cleanup PREVIEW (nothing was changed) ===\n");
    console.log(`Jobs examined:                 ${results.length}`);
    console.log(`  Protected (never touched):   ${count("protected")}   ← manual entries, notes, saved/applied/interview stages, prep, scores`);
    console.log(`  Skipped (archived/new-rule): ${count("skip")}`);
    console.log(`  Keep (still qualify):        ${count("keep")}`);
    console.log(`  Needs review (NOT archived): ${count("review")}   ← ambiguous; apply leaves these alone`);
    console.log(`  WOULD ARCHIVE:               ${archive.length}\n`);

    const group = (rows: Result[], key: (r: Result) => string) => {
      const m = new Map<string, number>();
      rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
      return [...m].sort((a, b) => b[1] - a[1]);
    };
    console.log("Would archive — by reason:");
    group(archive, (r) => r.code).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));
    console.log("\nWould archive — by source:");
    group(archive, (r) => r.sourceLabel).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));
    console.log("\nProtected — by reason:");
    group(results.filter((r) => r.bucket === "protected"), (r) => r.reason).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const csvPath = `cleanup-preview-${stamp}.csv`;
    const jsonPath = `cleanup-preview-${stamp}.json`;
    const header = ["bucket", "code", "job_id", "title", "company_shown", "location", "source", "job_url", "created_at", "reason"];
    writeFileSync(
      csvPath,
      [header.join(","), ...results.filter((r) => ["archive", "review", "protected"].includes(r.bucket)).map((r) =>
        [r.bucket, r.code, r.job.id, r.job.title, r.job.company, r.job.location, r.sourceLabel, r.job.jobUrl, r.job.createdAt.toISOString(), r.reason].map(csvCell).join(",")
      )].join("\n")
    );
    const manifest = { generatedAt: new Date().toISOString(), ids: archive.map((r) => r.job.id), items: archive.map((r) => ({ id: r.job.id, reason: r.reason })), hash: hash(archive.map((r) => r.job.id)) };
    writeFileSync(jsonPath, JSON.stringify(manifest, null, 2));
    console.log(`\nWrote ${csvPath} (every archive/review/protected row with its reason) and ${jsonPath}.`);
    console.log(`Manifest hash: ${manifest.hash}  — apply refuses to run unless this still matches.\n`);
    return;
  }

  /* ------------------------------------------------------------------ apply */
  const manifestPath = process.argv[process.argv.indexOf("--manifest") + 1];
  const confirm = process.argv[process.argv.indexOf("--confirm") + 1];
  if (!manifestPath || !confirm || manifestPath.startsWith("--") || confirm.startsWith("--")) throw new Error("apply needs --manifest <file> --confirm <hash>");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { ids: string[]; hash: string };
  const current = hash(archive.map((r) => r.job.id));
  if (confirm !== manifest.hash) {
    throw new Error(`Refusing to apply: --confirm "${confirm}" doesn't match the manifest hash (${manifest.hash}).`);
  }
  if (current !== manifest.hash) {
    throw new Error(`Refusing to apply: the set to archive has changed since the preview (manifest ${manifest.hash}, now ${current}). Re-run preview.`);
  }

  const rehearse = process.argv.includes("--rehearse");
  const lockArg = process.argv.indexOf("--lock-timeout-ms");
  const lockTimeoutMs = lockArg > -1 ? Number(process.argv[lockArg + 1]) : 5000;
  if (!Number.isFinite(lockTimeoutMs) || lockTimeoutMs < 100) throw new Error("--lock-timeout-ms must be a number ≥ 100.");

  {
    const report = await applyArchive(db as never, archive.map((r) => ({ id: r.job.id, reason: r.reason })), { rehearse, lockTimeoutMs });
    console.log(rehearse ? "\n=== REHEARSAL — everything below was rolled back; nothing was changed ===" : "\n=== APPLIED ===");
    console.log(`Previewed set:            ${report.requested}`);
    console.log(`Skipped at write time:    ${report.skipped.length}`);
    for (const [why, n] of Object.entries(report.skipped.reduce<Record<string, number>>((m, x) => ((m[x.reason] = (m[x.reason] ?? 0) + 1), m), {}))) console.log(`    ${String(n).padStart(4)}  ${why}`);
    console.log(`Sent to guarded UPDATE:   ${report.attempted}`);
    console.log(`Rows ${rehearse ? "that would be " : ""}actually updated: ${report.updated}${report.guardBlocked ? `  (${report.guardBlocked} stopped by SQL guards)` : ""}`);
    if (!rehearse) {
      console.log("\nUndo SQL (restores status and clears the markers; updated_at was never changed):");
      console.log(report.undoSql);
    } else {
      console.log("\nHappy with those numbers? Re-run the same command without --rehearse.");
    }
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => pool?.end());
