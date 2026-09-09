import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Neon HTTP driver — stateless, fetch-based, and safe to import from
 * Server Components, Server Actions, Route Handlers, and the Edge
 * runtime (middleware). Each query is a single HTTP request, so this
 * client needs no connection pooling logic of its own; that's handled
 * by Neon's pooled connection string (see .env.local.example).
 *
 * If a feature later needs multi-statement transactions, add a second
 * client using `drizzle-orm/neon-serverless` (the WebSocket driver) —
 * that one supports interactive transactions but is Node-only, so keep
 * it out of anything that runs on the Edge (e.g. middleware.ts).
 */
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
