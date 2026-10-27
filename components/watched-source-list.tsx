"use client";

import * as React from "react";
import { RefreshCw, Trash2, Power } from "lucide-react";
import { runDiscoveryNow, deleteWatchedSource, toggleWatchedSource, setSourceExclusion, setSourceExclusionOverride } from "@/app/actions/ats";
import { REJECT_LABELS, REVIEW_LABELS } from "@/lib/discovery/eligibility";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ATS_PROVIDER_LABELS } from "@/lib/ats";
import type { AtsWatchedSource } from "@/lib/db/schema";

function SourceRow({ source }: { source: AtsWatchedSource }) {
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const supportsAutomation = source.provider !== "workday";

  return (
    <div className="flex flex-col gap-2 border-b py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{source.label}</p>
          <p className="text-xs text-muted-foreground">
            {ATS_PROVIDER_LABELS[source.provider as keyof typeof ATS_PROVIDER_LABELS]} · {source.boardToken}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {source.excluded && <Badge variant="destructive">{source.exclusionOverride ? "Excluded (override on)" : "Excluded"}</Badge>}
          <Badge variant={source.enabled ? "secondary" : "outline"}>{source.enabled ? "Watching" : "Paused"}</Badge>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await setSourceExclusion(source.id, !source.excluded, source.excluded ? undefined : window.prompt("Why exclude this source? (optional)") ?? undefined);
                if (result?.error) setError(result.error);
              });
            }}
          >
            {source.excluded ? "Remove exclusion" : "Exclude"}
          </Button>
          {source.excluded && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => startTransition(async () => { await setSourceExclusionOverride(source.id, !source.exclusionOverride); })}
            >
              {source.exclusionOverride ? "Turn override off" : "Allow anyway"}
            </Button>
          )}
          {supportsAutomation && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending || !source.enabled}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await runDiscoveryNow(source.id);
                  if (result?.error) setError(result.error);
                });
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
              Run now (up to 10 new)
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => startTransition(() => toggleWatchedSource(source.id, !source.enabled))}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => startTransition(() => deleteWatchedSource(source.id))}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!supportsAutomation && (
        <p className="text-xs text-muted-foreground">
          Workday doesn&apos;t expose a stable public API — use &ldquo;Add job&rdquo; to paste postings from this
          employer manually.
        </p>
      )}
      {source.excluded && source.exclusionReason && <p className="text-xs text-muted-foreground">Exclusion reason: {source.exclusionReason}</p>}
      {source.lastRunStats && (Object.keys(source.lastRunStats.rejected).length > 0 || Object.keys(source.lastRunStats.review).length > 0) && (
        <p className="text-xs text-muted-foreground">
          {Object.entries(source.lastRunStats.rejected).map(([code, n]) => `${REJECT_LABELS[code] ?? code}: ${n}`).join(" · ")}
          {Object.keys(source.lastRunStats.review).length > 0 && (
            <>
              {" | to review — "}
              {Object.entries(source.lastRunStats.review).map(([code, n]) => `${REVIEW_LABELS[code] ?? code}: ${n}`).join(" · ")}
            </>
          )}
        </p>
      )}
      {source.lastRunAt && (
        <p className="text-xs text-muted-foreground">
          Last run {new Date(source.lastRunAt).toLocaleString()} ·{" "}
          {source.lastRunStatus === "error" ? (
            <span className="text-destructive">{source.lastRunError}</span>
          ) : source.lastRunStatus === "skipped" ? (
            <span className="text-amber-600 dark:text-amber-400">{source.lastRunError}</span>
          ) : (
            `${source.lastRunJobsFound ?? 0} qualifying listing${source.lastRunJobsFound === 1 ? "" : "s"} (incl. needs-review), ${source.lastRunJobsNew ?? 0} new`
          )}
        </p>
      )}
    </div>
  );
}

export function WatchedSourceList({ sources }: { sources: AtsWatchedSource[] }) {
  if (sources.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No watched boards yet</CardTitle>
          <CardDescription>Add one above to start pulling in postings automatically.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Watched boards</CardTitle>
        <CardDescription>Refreshed daily by Vercel Cron, or on demand with &ldquo;Run now&rdquo;.</CardDescription>
      </CardHeader>
      <CardContent>
        {sources.map((source) => (
          <SourceRow key={source.id} source={source} />
        ))}
      </CardContent>
    </Card>
  );
}
