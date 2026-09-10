import type { AtsAdapter, AtsProvider } from "@/lib/ats/types";
import { greenhouseAdapter } from "@/lib/ats/greenhouse";
import { leverAdapter } from "@/lib/ats/lever";
import { ashbyAdapter } from "@/lib/ats/ashby";
import { smartrecruitersAdapter } from "@/lib/ats/smartrecruiters";
import { workdayAdapter } from "@/lib/ats/workday";

export const ATS_ADAPTERS: Record<AtsProvider, AtsAdapter> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
  smartrecruiters: smartrecruitersAdapter,
  workday: workdayAdapter,
};

export const ATS_PROVIDER_LABELS: Record<AtsProvider, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workday: "Workday (manual import only)",
};

export * from "@/lib/ats/types";
export { stripHtml, matchesDesignRole, normalizeForDedupe } from "@/lib/ats/normalize";
