import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jobs, jobAnalyses, resumes, interviewPreps } from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InterviewPrepForm } from "@/components/interview-prep-form";
import { InterviewPrepPanel } from "@/components/interview-prep-panel";

export default async function JobInterviewPrepPage({ params }: { params: { id: string } }) {
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

  const [latestPrep] = await db
    .select()
    .from(interviewPreps)
    .where(eq(interviewPreps.jobId, job.id))
    .orderBy(desc(interviewPreps.createdAt))
    .limit(1);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Interview prep — {job.title}</h2>
        <p className="text-sm text-muted-foreground">{job.company}</p>
      </div>

      {!analysis ? (
        <Card>
          <CardHeader>
            <CardTitle>Analyze this job first</CardTitle>
            <CardDescription>
              Interview prep is built from the job's Gemini analysis. Run that from the job's page first.
            </CardDescription>
            <Button asChild className="mt-2 w-fit">
              <Link href={`/jobs/${job.id}`}>Go to job</Link>
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{latestPrep ? "Regenerate prep" : "Generate prep"}</CardTitle>
            <CardDescription>
              {latestPrep
                ? "Generating again creates a fresh pack below — useful after updating your resume."
                : "Pulls from this job's analysis and, optionally, one of your resumes."}
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <InterviewPrepForm
              jobId={job.id}
              resumes={userResumes.map((r) => ({ id: r.id, label: r.label }))}
            />
          </div>
        </Card>
      )}

      {latestPrep && <InterviewPrepPanel prep={latestPrep} />}
    </div>
  );
}
