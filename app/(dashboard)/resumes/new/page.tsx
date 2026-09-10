import { ResumeForm } from "@/components/resume-form";

export default function NewResumePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Add a resume</h2>
        <p className="text-sm text-muted-foreground">
          Paste the resume text as-is — Gemini extracts skills and experience as soon as you save.
        </p>
      </div>
      <ResumeForm />
    </div>
  );
}
