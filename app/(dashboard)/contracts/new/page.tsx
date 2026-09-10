import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recruiterContacts } from "@/lib/db/schema";
import { ContractOpportunityForm } from "@/components/contract-opportunity-form";

export default async function NewContractOpportunityPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const contacts = await db.select().from(recruiterContacts).where(eq(recruiterContacts.userId, userId));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Add a contract opportunity</h2>
      </div>
      <ContractOpportunityForm recruiterContacts={contacts.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
