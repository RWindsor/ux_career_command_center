"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  recruiterAgencies,
  recruiterContacts,
  recruiterContactHistory,
  recruiterStatusEnum,
} from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/require-user";

type RecruiterStatus = (typeof recruiterStatusEnum.enumValues)[number];

/** Agencies */

export async function createAgency(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const name = String(formData.get("name") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) return { error: "Agency name is required." };

  await db.insert(recruiterAgencies).values({
    userId,
    name,
    website: website || null,
    notes: notes || null,
  });

  revalidatePath("/dashboard/recruiters");
  redirect("/dashboard/recruiters");
}

export async function deleteAgency(agencyId: string): Promise<void> {
  const userId = await requireUserId();
  const [agency] = await db.select().from(recruiterAgencies).where(eq(recruiterAgencies.id, agencyId)).limit(1);
  if (!agency || agency.userId !== userId) throw new Error("Agency not found.");

  await db.delete(recruiterAgencies).where(eq(recruiterAgencies.id, agencyId));
  revalidatePath("/dashboard/recruiters");
}

/** Contacts */

export async function createContact(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string } | void> {
  const userId = await requireUserId();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const agencyId = String(formData.get("agencyId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const followUpDate = String(formData.get("followUpDate") ?? "").trim();

  if (!name) return { error: "Contact name is required." };

  const [contact] = await db
    .insert(recruiterContacts)
    .values({
      userId,
      name,
      email: email || null,
      phone: phone || null,
      agencyId: agencyId || null,
      notes: notes || null,
      followUpDate: followUpDate ? new Date(followUpDate) : null,
    })
    .returning();

  revalidatePath("/dashboard/recruiters");
  redirect(`/dashboard/recruiters/contacts/${contact.id}`);
}

export async function updateContactDetails(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  const contactId = String(formData.get("contactId") ?? "");

  const [contact] = await db.select().from(recruiterContacts).where(eq(recruiterContacts.id, contactId)).limit(1);
  if (!contact || contact.userId !== userId) return { error: "Contact not found." };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const followUpDate = String(formData.get("followUpDate") ?? "").trim();

  if (!name) return { error: "Contact name is required." };

  await db
    .update(recruiterContacts)
    .set({
      name,
      email: email || null,
      phone: phone || null,
      notes: notes || null,
      followUpDate: followUpDate ? new Date(followUpDate) : null,
      updatedAt: new Date(),
    })
    .where(eq(recruiterContacts.id, contactId));

  revalidatePath(`/dashboard/recruiters/contacts/${contactId}`);
  revalidatePath("/dashboard/recruiters");
}

export async function updateContactStatus(contactId: string, status: RecruiterStatus): Promise<void> {
  const userId = await requireUserId();
  const [contact] = await db.select().from(recruiterContacts).where(eq(recruiterContacts.id, contactId)).limit(1);
  if (!contact || contact.userId !== userId) throw new Error("Contact not found.");

  await db
    .update(recruiterContacts)
    .set({ status, updatedAt: new Date() })
    .where(eq(recruiterContacts.id, contactId));

  revalidatePath(`/dashboard/recruiters/contacts/${contactId}`);
  revalidatePath("/dashboard/recruiters");
}

export async function deleteContact(contactId: string): Promise<void> {
  const userId = await requireUserId();
  const [contact] = await db.select().from(recruiterContacts).where(eq(recruiterContacts.id, contactId)).limit(1);
  if (!contact || contact.userId !== userId) throw new Error("Contact not found.");

  await db.delete(recruiterContacts).where(eq(recruiterContacts.id, contactId));
  revalidatePath("/dashboard/recruiters");
  redirect("/dashboard/recruiters");
}

/** Contact history */

export async function addContactHistoryEntry(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  const contactId = String(formData.get("contactId") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const [contact] = await db.select().from(recruiterContacts).where(eq(recruiterContacts.id, contactId)).limit(1);
  if (!contact || contact.userId !== userId) return { error: "Contact not found." };
  if (!note) return { error: "A note is required to log contact history." };

  const now = new Date();

  await db.insert(recruiterContactHistory).values({
    contactId,
    note,
    contactedAt: now,
  });

  // Logging contact is, by definition, a contact — keep lastContactedDate current.
  await db
    .update(recruiterContacts)
    .set({ lastContactedDate: now, updatedAt: now })
    .where(eq(recruiterContacts.id, contactId));

  revalidatePath(`/dashboard/recruiters/contacts/${contactId}`);
}
