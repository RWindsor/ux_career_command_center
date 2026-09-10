"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createContact } from "@/app/actions/recruiters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save contact"}
    </Button>
  );
}

export function RecruiterContactForm({ agencies }: { agencies: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState(createContact, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a recruiter contact</CardTitle>
        <CardDescription>Starts in the "New" pipeline stage.</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Jordan Lee" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="agencyId">Agency (optional)</Label>
              <select
                id="agencyId"
                name="agencyId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">No agency / independent</option>
                {agencies.map((agency) => (
                  <option key={agency.id} value={agency.id}>
                    {agency.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input id="email" name="email" type="email" placeholder="jordan@agency.com" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" name="phone" type="tel" placeholder="(555) 555-5555" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="followUpDate">Follow-up date (optional)</Label>
              <Input id="followUpDate" name="followUpDate" type="date" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" placeholder="How you connected, what they're placing for…" />
          </div>
        </CardContent>
        <CardFooter>
          <SubmitButton />
        </CardFooter>
      </form>
    </Card>
  );
}
