"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createSavedSearch } from "@/app/actions/saved-searches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

const PROVIDER_OPTIONS = [
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "ashby", label: "Ashby" },
  { value: "smartrecruiters", label: "SmartRecruiters" },
] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Searching…" : "Save search & find boards"}
    </Button>
  );
}

export function SavedSearchForm({ searchConfigured }: { searchConfigured: boolean }) {
  const [state, formAction] = useFormState(createSavedSearch, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search for roles</CardTitle>
        <CardDescription>
          Describe what you&apos;re looking for — no need to already know which companies to check. This resolves
          matching company boards across Greenhouse, Lever, Ashby, and SmartRecruiters, then polls them for postings
          going forward.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          {!searchConfigured && (
            <p className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
              Web-search discovery isn&apos;t configured yet (missing GOOGLE_SEARCH_API_KEY /
              GOOGLE_SEARCH_ENGINE_ID) — you can still save a search, but board resolution will report an error
              until it&apos;s set up. In the meantime, use &ldquo;Watch a specific board&rdquo; below.
            </p>
          )}
          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="label">Search name</Label>
              <Input id="label" name="label" placeholder="Senior Product Designer, remote" />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="keywords">Titles / keywords (comma-separated)</Label>
              <Input id="keywords" name="keywords" placeholder="Product Designer, UX Designer, Senior Designer" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="locationQuery">Location / remote preference (optional)</Label>
              <Input id="locationQuery" name="locationQuery" placeholder="Remote" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="employmentType">Employment type (optional)</Label>
              <Input id="employmentType" name="employmentType" placeholder="Full-time" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>ATS ecosystems to search</Label>
            <div className="flex flex-wrap gap-4">
              {PROVIDER_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="providers" value={option.value} defaultChecked className="h-4 w-4 rounded border-input" />
                  {option.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Workday isn&apos;t listed — it has no stable public API, so postings from Workday-hosted employers
              have to be added manually (paste the posting under &ldquo;Add job&rdquo;).
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <SubmitButton />
        </CardFooter>
      </form>
    </Card>
  );
}
