"use server";

import { AuthError } from "next-auth";
import { hash } from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signIn, signOut } from "@/auth";
import { DEFAULT_CATEGORIES } from "@/lib/constants";

export type AuthState = { error?: string } | undefined;

const signupSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists" };

  const passwordHash = await hash(password, 10);
  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      categories: {
        create: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i })),
      },
    },
  });

  await signIn("credentials", { email, password, redirect: false });
  redirect("/onboarding");
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) return { error: "Email or password is incorrect" };
    throw err;
  }
  redirect("/dashboard");
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
