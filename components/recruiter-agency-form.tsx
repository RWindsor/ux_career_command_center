"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createAgency } from "@/app/actions/recruiters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save agency"}
    </Button>
  );
}

export function RecruiterAgencyForm() {
  const [state, formAction] = useFormState(createAgency, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a recruiting agency</CardTitle>
        <CardDescription>Group recruiter contacts under the agency they work for.</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Agency name</Label>
            <Input id="name" name="name" placeholder="Acme Talent Partners" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="website">Website (optional)</Label>
            <Input id="website" name="website" type="url" placeholder="https://…" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" placeholder="How you found them, specialties, etc." />
          </div>
        </CardContent>
        <CardFooter>
          <SubmitButton />
        </CardFooter>
      </form>
    </Card>
  );
}
