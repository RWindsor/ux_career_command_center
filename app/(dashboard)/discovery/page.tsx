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

  const duplicateQueue = allJobs.filter((job) => job.duplicateOfJobId && !job.duplicateReviewed);
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

      <SavedSearchForm searchConfigured={webSearchProvider.isConfigured()} />
      <SavedSearchList searches={searches} />

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
