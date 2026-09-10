"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { deleteJob } from "@/app/actions/jobs";
import { Button } from "@/components/ui/button";

export function DeleteJobButton({ jobId }: { jobId: string }) {
  const [isPending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={() => {
        if (!window.confirm("Delete this job and its analysis? This can't be undone.")) return;
        startTransition(() => {
          deleteJob(jobId);
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
      {isPending ? "Deleting…" : "Delete"}
    </Button>
  );
}
