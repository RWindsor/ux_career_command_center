"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createApplicationPackage } from "@/app/actions/application-package";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Generating with Gemini…" : "Generate application package"}
    </Button>
  );
}

export function ApplicationPackageForm({ jobId, resumes }: { jobId: string; resumes: { id: string; label: string }[] }) {
  const [state, formAction] = useFormState(createApplicationPackage, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="jobId" value={jobId} />

      {state?.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}

      <div className="flex flex-col gap-2 sm:max-w-xs">
        <Label htmlFor="resumeId">Resume to tailor</Label>
        <select
          id="resumeId"
          name="resumeId"
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {resumes.map((resume) => (
            <option key={resume.id} value={resume.id}>
              {resume.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
