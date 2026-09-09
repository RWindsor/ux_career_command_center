import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Application users. Passwords are hashed with bcrypt before insert —
 * never store plaintext (see app/actions/auth.ts).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
