import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jobs, interviewPreps } from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function InterviewPrepHubPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const userJobs = await db.select().from(jobs).where(eq(jobs.userId, userId)).orderBy(desc(jobs.createdAt));

  const jobIds = userJobs.map((j) => j.id);
  const preps = jobIds.length > 0 ? await db.select().from(interviewPreps).where(inArray(interviewPreps.jobId, jobIds)) : [];
  const jobsWithPrep = new Set(preps.map((p) => p.jobId));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Interview Prep Center</h2>
        <p className="text-sm text-muted-foreground">
          Generate a full prep pack — company research, questions, STAR stories, and more — for any job in your pipeline.
        </p>
      </div>

      {userJobs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No jobs yet</CardTitle>
            <CardDescription>Add a job to your pipeline first.</CardDescription>
            <Button asChild className="mt-2 w-fit">
              <Link href="/dashboard/jobs/new">Add a job</Link>
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {userJobs.map((job) => (
            <Link key={job.id} href={`/dashboard/jobs/${job.id}/interview-prep`}>
              <Card className="transition-colors hover:bg-secondary/50">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-medium">{job.title}</p>
                    <p className="text-sm text-muted-foreground">{job.company}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{job.status}</Badge>
                    {jobsWithPrep.has(job.id) ? (
                      <Badge>Prep ready</Badge>
                    ) : (
                      <Badge variant="secondary">Not prepped</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
