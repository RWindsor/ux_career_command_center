import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jobs, jobAnalyses, resumes, applicationPackages } from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApplicationPackageForm } from "@/components/application-package-form";
import { ApplicationPackagePanel } from "@/components/application-package-panel";

export default async function ApplicationPackagePage({ params }: { params: { id: string } }) {
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

  const userResumes = await db.select().from(resumes).where(eq(resumes.userId, userId)).orderBy(desc(resumes.createdAt));

  const packages = await db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.jobId, job.id))
    .orderBy(desc(applicationPackages.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Application package — {job.title}</h2>
        <p className="text-sm text-muted-foreground">{job.company}</p>
      </div>

      {!analysis ? (
        <Card>
          <CardHeader>
            <CardTitle>Analyze this job first</CardTitle>
            <CardDescription>The application package is built from the job&apos;s Gemini analysis.</CardDescription>
            <Button asChild className="mt-2 w-fit">
              <Link href={`/dashboard/jobs/${job.id}`}>Go to job</Link>
            </Button>
          </CardHeader>
        </Card>
      ) : userResumes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Add a resume first</CardTitle>
            <CardDescription>A tailored application package needs a resume to work from.</CardDescription>
            <Button asChild className="mt-2 w-fit">
              <Link href="/dashboard/resumes/new">Add a resume</Link>
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{packages.length > 0 ? "Regenerate" : "Generate"}</CardTitle>
            <CardDescription>
              {packages.length > 0
                ? "Generating again adds a fresh package below — prior drafts stay in history."
                : "Pulls from this job's analysis, the selected resume, and any match score on file."}
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <ApplicationPackageForm jobId={job.id} resumes={userResumes.map((r) => ({ id: r.id, label: r.label }))} />
          </div>
        </Card>
      )}

      {packages.length > 0 && (
        <div className="flex flex-col gap-8">
          {packages.map((pkg, i) => (
            <div key={pkg.id} className="flex flex-col gap-2">
              {i > 0 && <p className="text-xs uppercase tracking-wide text-muted-foreground">Earlier draft</p>}
              <ApplicationPackagePanel pkg={pkg} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
