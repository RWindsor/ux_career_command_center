"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { deleteAgency } from "@/app/actions/recruiters";
import { Button } from "@/components/ui/button";

export function DeleteAgencyButton({ agencyId }: { agencyId: string }) {
  const [isPending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={() => {
        if (!window.confirm("Delete this agency? Contacts linked to it will be kept, just unlinked.")) return;
        startTransition(() => {
          deleteAgency(agencyId);
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
      {isPending ? "Deleting…" : "Delete"}
    </Button>
  );
}
