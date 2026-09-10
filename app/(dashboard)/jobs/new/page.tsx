import { JobForm } from "@/components/job-form";

export default function NewJobPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Add a job</h2>
        <p className="text-sm text-muted-foreground">
          Paste the posting text as-is — Gemini runs the analysis as soon as you save.
        </p>
      </div>
      <JobForm />
    </div>
  );
}
