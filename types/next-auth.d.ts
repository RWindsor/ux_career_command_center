import type { DefaultSession } from "next-auth";

/**
 * Extends Auth.js's built-in session type with `id`, which we add to
 * the session in auth.ts's `session` callback but isn't there by default.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
