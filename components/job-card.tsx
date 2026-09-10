import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import type { Job, JobAnalysis } from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS } from "@/lib/pipeline";

export function JobCard({ job, analysis }: { job: Job; analysis: JobAnalysis | null }) {
  return (
    <Link href={`/dashboard/jobs/${job.id}`}>
      <Card className="transition-colors hover:border-primary/50">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">{job.title}</CardTitle>
            <CardDescription>
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {job.duplicateOfJobId && !job.duplicateReviewed && (
              <Badge variant="destructive">Possible repeat</Badge>
            )}
            <Badge variant="outline">{STAGE_LABELS[job.status]}</Badge>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {analysis ? (
            <>
              <p className="line-clamp-2 text-sm text-muted-foreground">{analysis.summary}</p>
              {analysis.keywords.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {analysis.keywords.slice(0, 6).map((keyword) => (
                    <Badge key={keyword} variant="secondary">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Analysis not available yet
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
