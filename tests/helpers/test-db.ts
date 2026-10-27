import { createRequire } from "node:module";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../lib/db/schema";

/**
 * Real-Postgres test harness. Only runs when TEST_DATABASE_URL is set, and refuses to touch anything that
 * could be your real database: the DB name must contain "test" and the URL must differ from DATABASE_URL.
 * The `public` schema of that database is DROPPED and recreated from lib/db/schema.ts (via drizzle-kit).
 */
export const TEST_URL = process.env.TEST_DATABASE_URL;

export function assertSafeTestUrl(url: string) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(name)) throw new Error(`Refusing: TEST_DATABASE_URL database name "${name}" must contain "test".`);
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) throw new Error("Refusing: TEST_DATABASE_URL equals DATABASE_URL.");
}

export interface Harness {
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
  userId: string;
  resumeId: string;
}

export async function createHarness(): Promise<Harness> {
  assertSafeTestUrl(TEST_URL!);
  const pool = new Pool({ connectionString: TEST_URL, max: 10 });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");

  // The ESM bundle of drizzle-kit/api doesn't load under tsx; its CJS entry does.
  const { generateDrizzleJson, generateMigration } = createRequire(`${process.cwd()}/package.json`)("drizzle-kit/api") as typeof import("drizzle-kit/api");
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  for (const st of statements) await pool.query(st);

  const db = drizzle(pool, { schema });
  const [user] = await db.insert(schema.users).values({ email: "test@example.com", passwordHash: "x" } as never).returning();
  const [resume] = await db.insert(schema.resumes).values({ userId: user.id, label: "r", rawText: "resume" } as never).returning();
  return { pool, db, userId: user.id, resumeId: resume.id };
}

let seq = 0;
export interface JobSeed {
  title?: string;
  location?: string | null;
  status?: string;
  notes?: string | null;
  offerCompensation?: string | null;
  duplicateReviewed?: boolean;
  discoveryState?: string | null;
  sourceName?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Inserts an untouched auto-discovered job that today's rules would archive (Canada-only remote). */
export async function seedJob(h: Harness, over: JobSeed = {}): Promise<string> {
  seq += 1;
  const created = over.createdAt ?? new Date("2026-09-01T00:00:00Z");
  const { rows } = await h.pool.query(
    `INSERT INTO jobs (user_id, title, company, job_url, location, description, status, notes, source_name, source_job_id,
                       normalized_company, normalized_title, duplicate_reviewed, offer_compensation, discovery_state, created_at, updated_at)
     VALUES ($1,$2,'Acme',$3,$4,'Full-time role.',$5::job_status,$6,$7::ats_provider,$8,'acme',$9,$10,$11,$12,$13,$14) RETURNING id`,
    [
      h.userId, over.title ?? "Product Designer", `https://boards.greenhouse.io/acme/jobs/${seq}`, over.location === undefined ? "Remote - Canada" : over.location,
      over.status ?? "discovered", over.notes ?? null, over.sourceName ?? "greenhouse", `sj-${seq}`, (over.title ?? "product designer").toLowerCase(),
      over.duplicateReviewed ?? false, over.offerCompensation ?? null, over.discoveryState ?? null, created, over.updatedAt ?? created,
    ]
  );
  return rows[0].id as string;
}

/** Inserts one child row for a job into any of the four protected tables, filling NOT NULL columns generically. */
export async function seedChild(h: Harness, table: "job_matches" | "application_packages" | "interview_preps" | "offer_preps", jobId: string) {
  const { rows: cols } = await h.pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND is_nullable='NO' AND column_default IS NULL`,
    [table]
  );
  const values: Record<string, unknown> = {};
  for (const c of cols) {
    if (c.column_name === "job_id") values[c.column_name] = jobId;
    else if (c.column_name === "resume_id") values[c.column_name] = h.resumeId;
    else if (c.data_type === "jsonb") values[c.column_name] = "[]";
    else if (c.data_type === "integer") values[c.column_name] = 1;
    else values[c.column_name] = "x";
  }
  const names = Object.keys(values);
  await h.pool.query(`INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(values));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
