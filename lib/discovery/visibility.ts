import type { Job } from "@/lib/db/schema";

/**
 * Jobs the system parked or archived (never the user's own saved/applied/manual entries).
 * Hidden from the default pipeline, dashboard stats, and duplicate queue.
 */
export function isHiddenDiscoveryJob(job: Pick<Job, "status" | "autoArchivedAt" | "discoveryState">): boolean {
  return job.discoveryState === "needs_review" || (job.status === "archived" && job.autoArchivedAt != null);
}
