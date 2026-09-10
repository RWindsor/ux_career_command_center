"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { generateWeeklyReport } from "@/app/actions/reports";
import { Button } from "@/components/ui/button";

export function GenerateWeeklyReportButton() {
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
            const result = await generateWeeklyReport();
            if (result?.error) setError(result.error);
          });
        }}
      >
        <Sparkles className={`h-4 w-4 ${isPending ? "animate-pulse" : ""}`} />
        {isPending ? "Generating…" : "Generate this week's report"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
