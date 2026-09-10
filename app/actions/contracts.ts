"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contractOpportunities, contractOpportunityStatusEnum } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/require-user";

type ContractStatus = (typeof contractOpportunityStatusEnum.enumValues)[number];

export async function createOpportunity(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const title = String(formData.get("title") ?? "").trim();
  const clientCompany = String(formData.get("clientCompany") ?? "").trim();
  const rate = String(formData.get("rate") ?? "").trim();
  const recruiterContactId = String(formData.get("recruiterContactId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!title) return { error: "A title is required." };

  await db.insert(contractOpportunities).values({
    userId,
    title,
    clientCompany: clientCompany || null,
    rate: rate || null,
    recruiterContactId: recruiterContactId || null,
    notes: notes || null,
  });

  revalidatePath("/dashboard/contracts");
  redirect("/dashboard/contracts");
}

export async function updateOpportunityStatus(opportunityId: string, status: ContractStatus): Promise<void> {
  const userId = await requireUserId();
  const [opportunity] = await db
    .select()
    .from(contractOpportunities)
    .where(eq(contractOpportunities.id, opportunityId))
    .limit(1);
  if (!opportunity || opportunity.userId !== userId) throw new Error("Opportunity not found.");

  await db
    .update(contractOpportunities)
    .set({ status, updatedAt: new Date() })
    .where(eq(contractOpportunities.id, opportunityId));

  revalidatePath("/dashboard/contracts");
}

export async function deleteOpportunity(opportunityId: string): Promise<void> {
  const userId = await requireUserId();
  const [opportunity] = await db
    .select()
    .from(contractOpportunities)
    .where(eq(contractOpportunities.id, opportunityId))
    .limit(1);
  if (!opportunity || opportunity.userId !== userId) throw new Error("Opportunity not found.");

  await db.delete(contractOpportunities).where(eq(contractOpportunities.id, opportunityId));
  revalidatePath("/dashboard/contracts");
}
