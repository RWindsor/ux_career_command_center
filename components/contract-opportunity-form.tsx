"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createOpportunity } from "@/app/actions/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save opportunity"}
    </Button>
  );
}

export function ContractOpportunityForm({
  recruiterContacts,
}: {
  recruiterContacts: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(createOpportunity, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a contract opportunity</CardTitle>
        <CardDescription>Optionally connect it to the recruiter who brought it to you.</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title / role</Label>
              <Input id="title" name="title" placeholder="Senior Product Designer, 6-mo contract" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="clientCompany">Client company (optional)</Label>
              <Input id="clientCompany" name="clientCompany" placeholder="Who the contract is actually for" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rate">Rate (optional)</Label>
              <Input id="rate" name="rate" placeholder="$95/hr, W2" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="recruiterContactId">Recruiter (optional)</Label>
              <select
                id="recruiterContactId"
                name="recruiterContactId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Not through a recruiter</option>
                {recruiterContacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" placeholder="Scope, duration, interview process…" />
          </div>
        </CardContent>
        <CardFooter>
          <SubmitButton />
        </CardFooter>
      </form>
    </Card>
  );
}
