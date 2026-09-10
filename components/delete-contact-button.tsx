"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { deleteContact } from "@/app/actions/recruiters";
import { Button } from "@/components/ui/button";

export function DeleteContactButton({ contactId }: { contactId: string }) {
  const [isPending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={() => {
        if (!window.confirm("Delete this recruiter contact and its history? This can't be undone.")) return;
        startTransition(() => {
          deleteContact(contactId);
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
      {isPending ? "Deleting…" : "Delete"}
    </Button>
  );
}
