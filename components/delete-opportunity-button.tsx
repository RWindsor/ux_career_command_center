"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { deleteOpportunity } from "@/app/actions/contracts";
import { Button } from "@/components/ui/button";

export function DeleteOpportunityButton({ opportunityId }: { opportunityId: string }) {
  const [isPending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={() => {
        if (!window.confirm("Delete this contract opportunity? This can't be undone.")) return;
        startTransition(() => {
          deleteOpportunity(opportunityId);
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
      {isPending ? "Deleting…" : "Delete"}
    </Button>
  );
}
