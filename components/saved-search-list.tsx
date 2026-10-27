"use client";

import * as React from "react";
import { Search, Trash2, Power } from "lucide-react";
import { resolveSavedSearchNow, deleteSavedSearch, toggleSavedSearch, updateSavedSearchControls } from "@/app/actions/saved-searches";
import { COUNTRIES } from "@/lib/discovery/eligibility";
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
            {search.workArrangement ? ` · ${search.workArrangement}` : ""}
            {search.eligibleCountry ? ` · ${search.eligibleCountry} only` : ""}
            {search.eligibleState ? ` · ${search.eligibleState} residents eligible` : ""}
            {search.excludedTitleTerms?.length ? ` · excludes: ${search.excludedTitleTerms.join(", ")}` : ""}
          </p>
          {!search.eligibleCountry && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No eligible country set — imports are paused until every active search has one. Use Edit filters to set it.
            </p>
          )}
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
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">Edit filters</summary>
        <form
          className="mt-2 grid gap-3 sm:grid-cols-2"
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = await updateSavedSearchControls(search.id, formData);
              if (result?.error) setError(result.error);
            });
          }}
        >
          <label className="flex flex-col gap-1 text-xs">
            Eligible country
            <select name="eligibleCountry" defaultValue={search.eligibleCountry ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Select a country (imports stay paused)</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            State eligibility
            <select name="eligibleState" defaultValue={search.eligibleState ?? "any"} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="any">No state rule</option>
              <option value="CA">California</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Work arrangement
            <select name="workArrangement" defaultValue={search.workArrangement ?? "any"} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="any">Any</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Employment type
            <input name="employmentType" defaultValue={search.employmentType ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Exclude titles containing
            <input name="excludedTitleTerms" defaultValue={(search.excludedTitleTerms ?? []).join(", ")} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={isPending}>
              Save filters
            </Button>
          </div>
        </form>
      </details>
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
