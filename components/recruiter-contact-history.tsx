"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addContactHistoryEntry } from "@/app/actions/recruiters";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RecruiterContactHistoryEntry } from "@/lib/db/schema";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Logging…" : "Log contact"}
    </Button>
  );
}

export function RecruiterContactHistory({
  contactId,
  history,
}: {
  contactId: string;
  history: RecruiterContactHistoryEntry[];
}) {
  const [state, formAction] = useFormState(addContactHistoryEntry, undefined);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="contactId" value={contactId} />
        {state?.error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
        )}
        <Textarea name="note" placeholder="What happened — call, email, update…" className="min-h-[80px]" required />
        <div>
          <SubmitButton />
        </div>
      </form>

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contact history logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {history.map((entry) => (
            <li key={entry.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <p className="text-xs text-muted-foreground">{new Date(entry.contactedAt).toLocaleString()}</p>
              <p className="text-sm">{entry.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
