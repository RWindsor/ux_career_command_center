import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray, and } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jobs, jobAnalyses, resumes, jobMatches } from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReanalyzeButton } from "@/components/reanalyze-button";
import { DeleteJobButton } from "@/components/delete-job-button";
import { AnalysisPanel } from "@/components/analysis-panel";
import { MatchScorePanel, type MatchScoreView } from "@/components/match-score-panel";
import { JobStatusSelect } from "@/components/job-status-select";
import { isOfferStage } from "@/lib/pipeline";

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { analysisError?: string };
}) {
  const session = await auth();
  const userId = session!.user!.id;

  const [job] = await db.select().from(jobs).where(eq(jobs.id, params.id)).limit(1);
  if (!job || job.userId !== userId) notFound();

  const [analysis] = await db
    .select()
    .from(jobAnalyses)
    .where(eq(jobAnalyses.jobId, job.id))
    .orderBy(desc(jobAnalyses.createdAt))
    .limit(1);

  const userResumes = await db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.createdAt));

  const matchesByResume: Record<string, MatchScoreView> = {};
  if (userResumes.length > 0) {
    const matchRows = await db
      .select()
      .from(jobMatches)
      .where(
        and(
          eq(jobMatches.jobId, job.id),
          inArray(
            jobMatches.resumeId,
            userResumes.map((resume) => resume.id)
          )
        )
      )
      .orderBy(desc(jobMatches.createdAt));

    for (const match of matchRows) {
      if (matchesByResume[match.resumeId]) continue; // rows are newest-first; keep the first seen per resume
      matchesByResume[match.resumeId] = {
        score: match.score,
        strengths: match.strengths,
        gaps: match.gaps,
        recommendations: match.recommendations,
        model: match.model,
      };
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">{job.title}</h2>
          <p className="text-sm text-muted-foreground">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
          </p>
          {job.jobUrl && (
            <a
              href={job.jobUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              View original posting
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <JobStatusSelect jobId={job.id} status={job.status} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/jobs/${job.id}/interview-prep`}>Interview prep</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/jobs/${job.id}/application-package`}>Application assistant</Link>
          </Button>
          {isOfferStage(job.status) && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/jobs/${job.id}/offer`}>Offer center</Link>
            </Button>
          )}
          <ReanalyzeButton jobId={job.id} />
          <DeleteJobButton jobId={job.id} />
        </div>
      </div>

      {job.duplicateOfJobId && !job.duplicateReviewed && (
        <p className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
          This looks like it might be a repeat of a job already in your pipeline.{" "}
          <Link href="/discovery" className="text-primary underline-offset-4 hover:underline">
            Review it on the Discovery page
          </Link>
          .
        </p>
      )}

      {searchParams.analysisError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          The job was saved, but Gemini analysis failed: {searchParams.analysisError}. You can retry with
          "Re-analyze" above.
        </p>
      )}

      {analysis ? (
        <AnalysisPanel analysis={analysis} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No analysis yet</CardTitle>
            <CardDescription>Run "Re-analyze" above to generate one.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {userResumes.length > 0 ? (
        <MatchScorePanel
          jobId={job.id}
          resumes={userResumes.map((resume) => ({ id: resume.id, label: resume.label }))}
          matchesByResume={matchesByResume}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Match score</CardTitle>
            <CardDescription>Add a resume to compare it against this job's requirements.</CardDescription>
            <Button asChild className="mt-2 w-fit">
              <Link href="/resumes/new">Add a resume</Link>
            </Button>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Original posting</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">{job.description}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
