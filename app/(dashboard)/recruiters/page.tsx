import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recruiterAgencies, recruiterContacts, recruiterStatusEnum } from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteAgencyButton } from "@/components/delete-agency-button";

const STATUS_LABELS: Record<(typeof recruiterStatusEnum.enumValues)[number], string> = {
  new: "New",
  contacted: "Contacted",
  responded: "Responded",
  interviewing: "Interviewing",
  placed: "Placed",
  inactive: "Inactive",
};

export default async function RecruitersPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const contacts = await db
    .select()
    .from(recruiterContacts)
    .where(eq(recruiterContacts.userId, userId))
    .orderBy(desc(recruiterContacts.updatedAt));

  const agencies = await db
    .select()
    .from(recruiterAgencies)
    .where(eq(recruiterAgencies.userId, userId))
    .orderBy(desc(recruiterAgencies.createdAt));

  const agencyNameById = new Map(agencies.map((a) => [a.id, a.name]));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Recruiters</h2>
          <p className="text-sm text-muted-foreground">Recruiter and contract-work pipeline, separate from your job applications.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/recruiters/agencies/new">Add agency</Link>
          </Button>
          <Button asChild>
            <Link href="/recruiters/contacts/new">Add contact</Link>
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-display text-lg font-semibold tracking-tight">Pipeline</h3>
        {contacts.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No recruiter contacts yet</CardTitle>
              <CardDescription>Add your first recruiter contact to start tracking the relationship.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recruiterStatusEnum.enumValues.map((status) => {
              const inStatus = contacts.filter((c) => c.status === status);
              return (
                <div key={status} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">{STATUS_LABELS[status]}</h4>
                    <Badge variant="secondary">{inStatus.length}</Badge>
                  </div>
                  <div className="flex flex-col gap-2">
                    {inStatus.map((contact) => (
                      <Link key={contact.id} href={`/recruiters/contacts/${contact.id}`}>
                        <Card className="transition-colors hover:bg-secondary/50">
                          <CardContent className="p-3">
                            <p className="text-sm font-medium">{contact.name}</p>
                            {contact.agencyId && (
                              <p className="text-xs text-muted-foreground">{agencyNameById.get(contact.agencyId)}</p>
                            )}
                            {contact.followUpDate && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Follow up {new Date(contact.followUpDate).toLocaleDateString()}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 font-display text-lg font-semibold tracking-tight">Agencies</h3>
        {agencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agencies added yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {agencies.map((agency) => (
              <Card key={agency.id}>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-medium">{agency.name}</p>
                    {agency.website && (
                      <a
                        href={agency.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {agency.website}
                      </a>
                    )}
                  </div>
                  <DeleteAgencyButton agencyId={agency.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
