import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Plus, FileText } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { resumes, resumeAnalyses, type ResumeAnalysis } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResumeCard } from "@/components/resume-card";

export default async function ResumesPage({
  searchParams,
}: {
  searchParams: { parseError?: string };
}) {
  const session = await auth();
  const userId = session!.user!.id;

  const userResumes = await db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.createdAt));

  const analysesByResume = new Map<string, ResumeAnalysis>();
  if (userResumes.length > 0) {
    const allAnalyses = await db
      .select()
      .from(resumeAnalyses)
      .where(
        inArray(
          resumeAnalyses.resumeId,
          userResumes.map((resume) => resume.id)
        )
      )
      .orderBy(desc(resumeAnalyses.createdAt));

    for (const analysis of allAnalyses) {
      if (!analysesByResume.has(analysis.resumeId)) analysesByResume.set(analysis.resumeId, analysis);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Resume Library</h2>
          <p className="text-sm text-muted-foreground">
            {userResumes.length} resume{userResumes.length === 1 ? "" : "s"} on file
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/resumes/new">
            <Plus className="h-4 w-4" />
            Add resume
          </Link>
        </Button>
      </div>

      {searchParams.parseError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          The resume was saved, but Gemini parsing failed: {searchParams.parseError}. Use "Re-parse" on the
          resume below to retry.
        </p>
      )}

      {userResumes.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
            <CardTitle>No resumes yet</CardTitle>
            <CardDescription>
              Add a resume so Match Scoring has something to compare jobs against.
            </CardDescription>
            <Button asChild className="mt-4">
              <Link href="/dashboard/resumes/new">Add your first resume</Link>
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {userResumes.map((resume) => (
            <ResumeCard key={resume.id} resume={resume} analysis={analysesByResume.get(resume.id) ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}
