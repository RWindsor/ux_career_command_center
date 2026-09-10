"use client";

import * as React from "react";
import { setOfferCompensation } from "@/app/actions/jobs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function OfferCompensationForm({ jobId, initialValue }: { jobId: string; initialValue: string | null }) {
  const [value, setValue] = React.useState(initialValue ?? "");
  const [isPending, startTransition] = React.useTransition();
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="offerCompensation">Compensation details (what you were actually offered)</Label>
      <Textarea
        id="offerCompensation"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder="Base salary, bonus, equity, benefits, start date, anything else stated in the offer…"
        className="min-h-[100px]"
      />
      <p className="text-xs text-muted-foreground">
        Only what you enter here is used for negotiation guidance — Gemini never fills in market-rate numbers on
        its own.
      </p>
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await setOfferCompensation(jobId, value);
              setSaved(true);
            })
          }
        >
          {isPending ? "Saving…" : saved ? "Saved" : "Save compensation details"}
        </Button>
      </div>
    </div>
  );
}
