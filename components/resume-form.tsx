"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createResume } from "@/app/actions/resumes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving & parsing…" : "Save & parse with Gemini"}
    </Button>
  );
}

export function ResumeForm() {
  const [state, formAction] = useFormState(createResume, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a resume</CardTitle>
        <CardDescription>
          Paste the full resume text — Gemini extracts skills, experience, and job titles for Match Scoring.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="label">Label</Label>
            <Input id="label" name="label" placeholder="Product Design Resume v3" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rawText">Resume text</Label>
            <Textarea
              id="rawText"
              name="rawText"
              placeholder="Paste the full resume text here…"
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
