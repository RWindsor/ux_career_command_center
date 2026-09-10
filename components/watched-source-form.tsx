"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createWatchedSource } from "@/app/actions/ats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { ATS_PROVIDER_LABELS } from "@/lib/ats";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Watch this board"}
    </Button>
  );
}

export function WatchedSourceForm() {
  const [state, formAction] = useFormState(createWatchedSource, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Watch a job board</CardTitle>
        <CardDescription>
          Add a company&apos;s ATS-hosted board to poll for new UX/Product Design postings. Greenhouse, Lever, and
          Ashby refresh automatically; Workday only supports manual import (paste the posting under &ldquo;Add
          job&rdquo; instead).
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="provider">ATS</Label>
              <select
                id="provider"
                name="provider"
                defaultValue="greenhouse"
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {Object.entries(ATS_PROVIDER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="boardToken">Board token / company slug</Label>
              <Input id="boardToken" name="boardToken" placeholder="e.g. figma" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="label">Label (optional)</Label>
              <Input id="label" name="label" placeholder="Figma" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The board token is the slug in that company&apos;s careers URL — e.g. for
            boards.greenhouse.io/<strong>figma</strong> or jobs.lever.co/<strong>figma</strong>, the token is
            &ldquo;figma&rdquo;.
          </p>
        </CardContent>
        <CardFooter>
          <SubmitButton />
        </CardFooter>
      </form>
    </Card>
  );
}
