"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createJob } from "@/app/actions/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving & analyzing…" : "Save & analyze with Gemini"}
    </Button>
  );
}

export function JobForm() {
  const [state, formAction] = useFormState(createJob, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a job posting</CardTitle>
        <CardDescription>
          Paste the full posting text — Gemini pulls out the summary, requirements, and keywords.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Job title</Label>
              <Input id="title" name="title" placeholder="Senior Product Designer" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="company">Company</Label>
              <Input id="company" name="company" placeholder="Acme Inc." required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="location">Location (optional)</Label>
              <Input id="location" name="location" placeholder="Remote · US" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="jobUrl">Posting URL (optional)</Label>
              <Input id="jobUrl" name="jobUrl" type="url" placeholder="https://…" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Job description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Paste the full job posting text here…"
              className="min-h-[240px]"
              required
            />
          </div>
        </CardContent>
        <CardFooter>
          <SubmitButton />
        </CardFooter>
      </form>
    </Card>
  );
}
