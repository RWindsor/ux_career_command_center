import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { atsWatchedSources, jobs } from "@/lib/db/schema";
import { listSavedSearches } from "@/app/actions/saved-searches";
import { SavedSearchForm } from "@/components/saved-search-form";
import { SavedSearchList } from "@/components/saved-search-list";
import { WatchedSourceForm } from "@/components/watched-source-form";
import { WatchedSourceList } from "@/components/watched-source-list";
import { DuplicateReviewCard } from "@/components/duplicate-review-card";
import { NeedsReviewCard } from "@/components/needs-review-card";
import { REJECT_LABELS, REVIEW_LABELS } from "@/lib/discovery/eligibility";
import { isHiddenDiscoveryJob } from "@/lib/discovery/visibility";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { webSearchProvider } from "@/lib/discovery/search-provider";

export default async function DiscoveryPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [searches, sources, allJobs] = await Promise.all([
    listSavedSearches(userId),
    db.select().from(atsWatchedSources).where(eq(atsWatchedSources.userId, userId)).orderBy(desc(atsWatchedSources.createdAt)),
    db.select().from(jobs).where(eq(jobs.userId, userId)),
  ]);

  const duplicateQueue = allJobs.filter((job) => job.duplicateOfJobId && !job.duplicateReviewed && !isHiddenDiscoveryJob(job));
  const needsReview = allJobs.filter((job) => job.discoveryState === "needs_review" && job.status !== "archived");
  const noEnabledSearch = !searches.some((s) => s.enabled);

  // Last-run rejection counts, summed across every watched source.
  const rejectedTotals: Record<string, number> = {};
  const reviewTotals: Record<string, number> = {};
  for (const source of sources) {
    for (const [code, n] of Object.entries(source.lastRunStats?.rejected ?? {})) rejectedTotals[code] = (rejectedTotals[code] ?? 0) + n;
    for (const [code, n] of Object.entries(source.lastRunStats?.review ?? {})) reviewTotals[code] = (reviewTotals[code] ?? 0) + n;
  }
  const jobsById = new Map(allJobs.map((job) => [job.id, job]));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Discovery</h2>
        <p className="text-sm text-muted-foreground">
          Search across supported ATS ecosystems by role and preferences — matching postings flow straight into your
          Job Pipeline with the usual Gemini analysis, duplicate detection, and match scoring.
        </p>
      </div>

      {noEnabledSearch && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          No saved search is enabled, so automatic imports are paused for every board (nothing is imported without a search to qualify against).
        </p>
      )}

      <SavedSearchForm searchConfigured={webSearchProvider.isConfigured()} />
      <SavedSearchList searches={searches} />

      {needsReview.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Needs review ({needsReview.length})</h3>
            <p className="text-sm text-muted-foreground">
              Geography, work arrangement, or employment type wasn&apos;t clear. Nothing here has been analyzed or added to your pipeline until you approve it.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {needsReview.map((job) => (
              <NeedsReviewCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {(Object.keys(rejectedTotals).length > 0 || Object.keys(reviewTotals).length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last discovery run — what was filtered out</CardTitle>
            <CardDescription>Summed across all watched boards (latest run of each).</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6 text-sm">
            <ul className="flex flex-col gap-1">
              {Object.entries(rejectedTotals).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
                <li key={code}>
                  <span className="font-medium">{n}</span> rejected — {REJECT_LABELS[code] ?? code}
                </li>
              ))}
              {Object.entries(reviewTotals).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
                <li key={code}>
                  <span className="font-medium">{n}</span> sent to review — {REVIEW_LABELS[code] ?? code}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {duplicateQueue.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Review possible repeats</h3>
            <p className="text-sm text-muted-foreground">
              These look like they might already be in your pipeline under a different posting.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {duplicateQueue.map((job) => (
              <DuplicateReviewCard
                key={job.id}
                job={job}
                existing={job.duplicateOfJobId ? jobsById.get(job.duplicateOfJobId) ?? null : null}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-display text-lg font-semibold">Watch a specific board</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Fallback for when you already know a company&apos;s board — also where saved searches&apos; resolved
          boards show up.
        </p>
        <div className="flex flex-col gap-4">
          <WatchedSourceForm />
          <WatchedSourceList sources={sources} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Why isn&apos;t there a single &ldquo;search everything&rdquo; button?</CardTitle>
          <CardDescription>
            Greenhouse, Lever, Ashby, and SmartRecruiters only expose per-company postings APIs — none of them offer
            a public endpoint to search postings across every company on their platform. Saved searches work around
            that by using web search to find candidate company boards matching your criteria, then polling each
            resolved board with the same normalization/dedup/analysis pipeline as a manually-added one. It's a
            best-effort discovery step, not a guarantee of completeness — a company won't surface if its board isn't
            indexed by search, or you can always add it directly below.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
