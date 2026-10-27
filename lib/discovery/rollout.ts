/**
 * Staged rollout switch for AUTOMATIC (scheduled) discovery.
 *
 * Scheduled imports run only when DISCOVERY_CRON_ENABLED is exactly the string "true". Anything else —
 * unset, "TRUE", "1", " true" — keeps the cron routes paused, so a typo can never switch imports on.
 * Manual "Run now" is NOT affected by this flag (that's how you verify a small batch first), but it is still
 * blocked while any enabled saved search has no eligible country (see planDiscovery / runDiscoveryForSource).
 */
export function discoveryCronEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DISCOVERY_CRON_ENABLED === "true";
}

export const CRON_PAUSED_MESSAGE =
  "Scheduled discovery is paused (DISCOVERY_CRON_ENABLED is not exactly 'true'). Nothing was imported or resolved. See DISCOVERY_PATCH_NOTES_REV2.md for the staged rollout.";
