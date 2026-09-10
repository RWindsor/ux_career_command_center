"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateContactDetails } from "@/app/actions/recruiters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RecruiterContact } from "@/lib/db/schema";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function RecruiterContactEditForm({ contact }: { contact: RecruiterContact }) {
  const [state, formAction] = useFormState(updateContactDetails, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="contactId" value={contact.id} />

      {state?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={contact.name} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="followUpDate">Follow-up date</Label>
          <Input id="followUpDate" name="followUpDate" type="date" defaultValue={toDateInputValue(contact.followUpDate)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={contact.email ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={contact.phone ?? ""} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Standing notes</Label>
        <Textarea id="notes" name="notes" defaultValue={contact.notes ?? ""} />
      </div>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
