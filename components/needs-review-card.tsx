"use client";

import * as React from "react";
import { approveReviewJob, rejectReviewJob } from "@/app/actions/ats";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { Job } from "@/lib/db/schema";

export function NeedsReviewCard({ job }: { job: Job }) {
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const run = (fn: (id: string) => Promise<{ error: string } | void>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn(job.id);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{job.title}</CardTitle>
        <CardDescription>
          {job.company}
          {job.location ? ` · ${job.location}` : " · no location listed"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {job.discoveryReason && <p className="text-sm text-muted-foreground">{job.discoveryReason}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {job.jobUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={job.jobUrl} target="_blank" rel="noreferrer">
                Open posting
              </a>
            </Button>
          )}
          <Button size="sm" disabled={isPending} onClick={() => run(approveReviewJob)}>
            Approve
          </Button>
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(rejectReviewJob)}>
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
