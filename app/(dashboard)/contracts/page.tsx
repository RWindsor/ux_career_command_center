import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { contractOpportunities, recruiterContacts } from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContractStatusSelect } from "@/components/contract-status-select";
import { DeleteOpportunityButton } from "@/components/delete-opportunity-button";

export default async function ContractsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const opportunities = await db
    .select()
    .from(contractOpportunities)
    .where(eq(contractOpportunities.userId, userId))
    .orderBy(desc(contractOpportunities.updatedAt));

  const contacts = await db.select().from(recruiterContacts).where(eq(recruiterContacts.userId, userId));
  const contactNameById = new Map(contacts.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Contract opportunities</h2>
          <p className="text-sm text-muted-foreground">Contract-work opportunities, separate from your full-time job pipeline.</p>
        </div>
        <Button asChild>
          <Link href="/contracts/new">Add opportunity</Link>
        </Button>
      </div>

      {opportunities.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No contract opportunities yet</CardTitle>
            <CardDescription>Add one, optionally linked to a recruiter.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {opportunities.map((opp) => (
            <Card key={opp.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-medium">{opp.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {[opp.clientCompany, opp.rate].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {opp.recruiterContactId && contactNameById.has(opp.recruiterContactId) && (
                    <Link
                      href={`/recruiters/contacts/${opp.recruiterContactId}`}
                      className="text-xs text-primary underline-offset-4 hover:underline"
                    >
                      via {contactNameById.get(opp.recruiterContactId)}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <ContractStatusSelect opportunityId={opp.id} status={opp.status} />
                  <DeleteOpportunityButton opportunityId={opp.id} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
