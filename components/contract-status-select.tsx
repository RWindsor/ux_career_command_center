"use client";

import * as React from "react";
import { updateOpportunityStatus } from "@/app/actions/contracts";

const STATUS_OPTIONS = ["new", "submitted", "interviewing", "offer", "placed", "closed"] as const;

const STATUS_LABELS: Record<(typeof STATUS_OPTIONS)[number], string> = {
  new: "New",
  submitted: "Submitted",
  interviewing: "Interviewing",
  offer: "Offer",
  placed: "Placed",
  closed: "Closed",
};

export function ContractStatusSelect({
  opportunityId,
  status,
}: {
  opportunityId: string;
  status: (typeof STATUS_OPTIONS)[number];
}) {
  const [isPending, startTransition] = React.useTransition();
  const [value, setValue] = React.useState(status);

  return (
    <select
      value={value}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as (typeof STATUS_OPTIONS)[number];
        setValue(next);
        startTransition(() => {
          updateOpportunityStatus(opportunityId, next);
        });
      }}
      className="h-9 rounded-md border border-input bg-background px-2 text-xs font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {STATUS_LABELS[option]}
        </option>
      ))}
    </select>
  );
}
