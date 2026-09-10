"use client";

import * as React from "react";
import { updateJobStatus } from "@/app/actions/jobs";
import { PIPELINE_STAGES, STAGE_LABELS, type PipelineStage } from "@/lib/pipeline";
import type { Job } from "@/lib/db/schema";

export function JobStatusSelect({ jobId, status }: { jobId: string; status: Job["status"] }) {
  const [isPending, startTransition] = React.useTransition();
  const [value, setValue] = React.useState<Job["status"]>(status);
  const [error, setError] = React.useState<string | null>(null);

  // Legacy statuses (saved/interviewing/archived) aren't offered as a choice, but the
  // job's current one is still shown in the list so the select never silently changes
  // a value the user didn't touch.
  const isLegacy = !PIPELINE_STAGES.includes(value as PipelineStage);

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={value}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value as PipelineStage;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const result = await updateJobStatus(jobId, next);
            if (result?.error) setError(result.error);
          });
        }}
        className="h-9 rounded-md border border-input bg-background px-2 text-xs font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {isLegacy && <option value={value}>{STAGE_LABELS[value]}</option>}
        {PIPELINE_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {STAGE_LABELS[stage]}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
