"use client";

import * as React from "react";
import Link from "next/link";
import { resolveDuplicate } from "@/app/actions/ats";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

export function DuplicateReviewCard({
  job,
  existing,
}: {
  job: { id: string; title: string; company: string; createdAt: Date };
  existing: { id: string; title: string; company: string; status: string; createdAt: Date } | null;
}) {
  const [isPending, startTransition] = React.useTransition();
  const [resolved, setResolved] = React.useState(false);

  if (resolved) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{job.title}</CardTitle>
        <CardDescription>
          {job.company} · added {new Date(job.createdAt).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {existing ? (
          <>
            Looks like a repeat of{" "}
            <Link href={`/dashboard/jobs/${existing.id}`} className="text-primary underline-offset-4 hover:underline">
              {existing.title} at {existing.company}
            </Link>{" "}
            (status: {existing.status}, added {new Date(existing.createdAt).toLocaleDateString()}).
          </>
        ) : (
          "The role this was flagged against no longer exists."
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/jobs/${job.id}`}>View this listing</Link>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await resolveDuplicate(job.id, "keep_separate");
              setResolved(true);
            })
          }
        >
          Keep as separate role
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await resolveDuplicate(job.id, "dismiss");
              setResolved(true);
            })
          }
        >
          Dismiss
        </Button>
      </CardFooter>
    </Card>
  );
}
