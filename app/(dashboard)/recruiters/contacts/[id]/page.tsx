import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recruiterContacts, recruiterAgencies, recruiterContactHistory, contractOpportunities } from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecruiterStatusSelect } from "@/components/recruiter-status-select";
import { RecruiterContactEditForm } from "@/components/recruiter-contact-edit-form";
import { RecruiterContactHistory } from "@/components/recruiter-contact-history";
import { DeleteContactButton } from "@/components/delete-contact-button";

export default async function RecruiterContactDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session!.user!.id;

  const [contact] = await db.select().from(recruiterContacts).where(eq(recruiterContacts.id, params.id)).limit(1);
  if (!contact || contact.userId !== userId) notFound();

  const agency = contact.agencyId
    ? (await db.select().from(recruiterAgencies).where(eq(recruiterAgencies.id, contact.agencyId)).limit(1))[0]
    : null;

  const history = await db
    .select()
    .from(recruiterContactHistory)
    .where(eq(recruiterContactHistory.contactId, contact.id))
    .orderBy(desc(recruiterContactHistory.contactedAt));

  const linkedOpportunities = await db
    .select()
    .from(contractOpportunities)
    .where(eq(contractOpportunities.recruiterContactId, contact.id))
    .orderBy(desc(contractOpportunities.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">{contact.name}</h2>
          <p className="text-sm text-muted-foreground">{agency ? agency.name : "Independent recruiter"}</p>
        </div>
        <div className="flex items-center gap-2">
          <RecruiterStatusSelect contactId={contact.id} status={contact.status} />
          <DeleteContactButton contactId={contact.id} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              {contact.lastContactedDate
                ? `Last contacted ${new Date(contact.lastContactedDate).toLocaleDateString()}`
                : "No contact logged yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecruiterContactEditForm contact={contact} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact history</CardTitle>
            <CardDescription>Log every touchpoint — logging one also updates "last contacted."</CardDescription>
          </CardHeader>
          <CardContent>
            <RecruiterContactHistory contactId={contact.id} history={history} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Linked contract opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          {linkedOpportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None yet.{" "}
              <Link href="/contracts/new" className="text-primary underline-offset-4 hover:underline">
                Add one
              </Link>{" "}
              and connect it to this recruiter.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {linkedOpportunities.map((opp) => (
                <li key={opp.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                  <span className="text-sm">{opp.title}</span>
                  <Badge variant="outline">{opp.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
