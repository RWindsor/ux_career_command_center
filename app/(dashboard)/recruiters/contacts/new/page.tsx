import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recruiterAgencies } from "@/lib/db/schema";
import { RecruiterContactForm } from "@/components/recruiter-contact-form";

export default async function NewRecruiterContactPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const agencies = await db.select().from(recruiterAgencies).where(eq(recruiterAgencies.userId, userId));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Add a recruiter contact</h2>
      </div>
      <RecruiterContactForm agencies={agencies.map((a) => ({ id: a.id, name: a.name }))} />
    </div>
  );
}
