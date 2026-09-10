import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jobs, jobAnalyses, resumes, offerPreps } from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OfferCompensationForm } from "@/components/offer-compensation-form";
import { OfferPrepForm } from "@/components/offer-prep-form";
import { OfferPrepPanel } from "@/components/offer-prep-panel";

export default async function OfferPage({ params }: { params: { id: string } }) {
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

  const preps = await db.select().from(offerPreps).where(eq(offerPreps.jobId, job.id)).orderBy(desc(offerPreps.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Offer center — {job.title}</h2>
        <p className="text-sm text-muted-foreground">{job.company}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compensation details</CardTitle>
          <CardDescription>Save this first — it&apos;s the only compensation input the negotiation guide uses.</CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <OfferCompensationForm jobId={job.id} initialValue={job.offerCompensation} />
        </div>
      </Card>

      {!analysis ? (
        <Card>
          <CardHeader>
            <CardTitle>Analyze this job first</CardTitle>
            <CardDescription>Offer prep is built from the job&apos;s Gemini analysis.</CardDescription>
            <Button asChild className="mt-2 w-fit">
              <Link href={`/dashboard/jobs/${job.id}`}>Go to job</Link>
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{preps.length > 0 ? "Regenerate" : "Generate"} offer prep</CardTitle>
            <CardDescription>
              {preps.length > 0
                ? "Generating again adds a fresh pack below — prior ones stay in history."
                : "Save compensation details above first for a grounded negotiation guide."}
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <OfferPrepForm jobId={job.id} resumes={userResumes.map((r) => ({ id: r.id, label: r.label }))} />
          </div>
        </Card>
      )}

      {preps.length > 0 && (
        <div className="flex flex-col gap-8">
          {preps.map((prep, i) => (
            <div key={prep.id} className="flex flex-col gap-2">
              {i > 0 && <p className="text-xs uppercase tracking-wide text-muted-foreground">Earlier version</p>}
              <OfferPrepPanel prep={prep} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
