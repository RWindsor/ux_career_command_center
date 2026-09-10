"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { reanalyzeJob } from "@/app/actions/jobs";
import { Button } from "@/components/ui/button";

export function ReanalyzeButton({ jobId }: { jobId: string }) {
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await reanalyzeJob(jobId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Re-analyzing…" : "Re-analyze"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
