"use client";

import * as React from "react";
import { Search, Trash2, Power } from "lucide-react";
import { resolveSavedSearchNow, deleteSavedSearch, toggleSavedSearch } from "@/app/actions/saved-searches";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { SavedSearch } from "@/lib/db/schema";

function SearchRow({ search }: { search: SavedSearch }) {
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 border-b py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{search.label}</p>
          <p className="text-xs text-muted-foreground">
            {search.keywords.join(", ")}
            {search.locationQuery ? ` · ${search.locationQuery}` : ""}
            {search.employmentType ? ` · ${search.employmentType}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={search.enabled ? "secondary" : "outline"}>{search.enabled ? "Active" : "Paused"}</Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending || !search.enabled}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await resolveSavedSearchNow(search.id);
                if (result?.error) setError(result.error);
              });
            }}
          >
            <Search className={`h-3.5 w-3.5 ${isPending ? "animate-pulse" : ""}`} />
            Find boards now
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => startTransition(() => toggleSavedSearch(search.id, !search.enabled))}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => startTransition(() => deleteSavedSearch(search.id))}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {search.lastResolvedAt && (
        <p className="text-xs text-muted-foreground">
          Last resolved {new Date(search.lastResolvedAt).toLocaleString()} ·{" "}
          {search.lastResolvedStatus === "error" ? (
            <span className="text-destructive">{search.lastResolvedError}</span>
          ) : (
            `${search.lastResolvedBoardsFound ?? 0} board${search.lastResolvedBoardsFound === 1 ? "" : "s"} matched (${search.lastResolvedStatus})`
          )}
        </p>
      )}
    </div>
  );
}

export function SavedSearchList({ searches }: { searches: SavedSearch[] }) {
  if (searches.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No saved searches yet</CardTitle>
          <CardDescription>Add one above — no need to already know which companies to check.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved searches</CardTitle>
        <CardDescription>Re-resolved daily by Vercel Cron to catch newly-listed company boards.</CardDescription>
      </CardHeader>
      <CardContent>
        {searches.map((search) => (
          <SearchRow key={search.id} search={search} />
        ))}
      </CardContent>
    </Card>
  );
}
