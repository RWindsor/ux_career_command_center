import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Plus, Briefcase } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jobs, jobAnalyses, type JobAnalysis } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { JobCard } from "@/components/job-card";

export default async function JobsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const userJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.userId, userId))
    .orderBy(desc(jobs.createdAt));

  const analysesByJob = new Map<string, JobAnalysis>();
  if (userJobs.length > 0) {
    const allAnalyses = await db
      .select()
      .from(jobAnalyses)
      .where(
        inArray(
          jobAnalyses.jobId,
          userJobs.map((job) => job.id)
        )
      )
      .orderBy(desc(jobAnalyses.createdAt));

    // Analyses are ordered newest-first, so the first one seen per job is the latest.
    for (const analysis of allAnalyses) {
      if (!analysesByJob.has(analysis.jobId)) analysesByJob.set(analysis.jobId, analysis);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Job Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            {userJobs.length} job{userJobs.length === 1 ? "" : "s"} tracked
          </p>
        </div>
        <Button asChild>
          <Link href="/jobs/new">
            <Plus className="h-4 w-4" />
            Add job
          </Link>
        </Button>
      </div>

      {userJobs.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <Briefcase className="mb-2 h-8 w-8 text-muted-foreground" />
            <CardTitle>No jobs yet</CardTitle>
            <CardDescription>
              Paste your first job posting and Gemini will pull out the summary, requirements, and keywords.
            </CardDescription>
            <Button asChild className="mt-4">
              <Link href="/jobs/new">Add your first job</Link>
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {userJobs.map((job) => (
            <JobCard key={job.id} job={job} analysis={analysesByJob.get(job.id) ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}
