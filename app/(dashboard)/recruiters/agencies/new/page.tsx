import { RecruiterAgencyForm } from "@/components/recruiter-agency-form";

export default function NewRecruiterAgencyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Add a recruiting agency</h2>
      </div>
      <RecruiterAgencyForm />
    </div>
  );
}
