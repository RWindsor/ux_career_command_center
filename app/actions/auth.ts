"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn as authSignIn, signOut as authSignOut } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function signIn(_prevState: unknown, formData: FormData): Promise<{ error: string } | void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");

  try {
    await authSignIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  revalidatePath("/", "layout");
  redirect(redirectTo || "/dashboard");
}

export async function signUp(_prevState: unknown, formData: FormData): Promise<{ error: string } | void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({ email, passwordHash });

  try {
    await authSignIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Try signing in manually." };
    }
    throw error;
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  await authSignOut({ redirect: false });
  revalidatePath("/", "layout");
  redirect("/login");
}
