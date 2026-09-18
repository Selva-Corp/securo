"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/session";
import { PAY_FREQUENCIES } from "@/lib/constants";
import { splitIsValid } from "@/lib/budget";
import { fromDateInput } from "@/lib/dates";
import { parseMoney } from "@/lib/money";

export type SettingsActionState = { ok: true; message?: string } | { ok: false; error: string } | undefined;

function revalidate() {
  for (const p of ["/settings", "/dashboard", "/budget", "/onboarding"]) revalidatePath(p);
}

/** A money text field ("1,234.50") to integer cents. */
const moneyField = z.string().transform((value, ctx) => {
  const cents = parseMoney(value);
  if (cents === null) {
    ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
    return z.NEVER;
  }
  return cents;
});

const pct = z.coerce.number({ error: "Enter a whole percentage" }).int("Use whole percentages").min(0).max(100);

const profileSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(80, "Keep your name under 80 characters"),
});

export async function updateProfile(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const userId = await requireUserId();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await prisma.user.update({ where: { id: userId }, data: { name: parsed.data.name } });
  revalidate();
  return { ok: true, message: "Profile saved." };
}

const budgetSchema = z.object({
  monthlyIncome: moneyField,
  needsPct: pct,
  wantsPct: pct,
  savingsPct: pct,
});

export async function updateBudgetSettings(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const userId = await requireUserId();
  const parsed = budgetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { monthlyIncome, needsPct, wantsPct, savingsPct } = parsed.data;
  if (monthlyIncome < 0) return { ok: false, error: "Income cannot be negative" };
  if (!splitIsValid(needsPct, wantsPct, savingsPct)) return { ok: false, error: "Your split needs to add up to exactly 100%" };
  await prisma.user.update({ where: { id: userId }, data: { monthlyIncome, needsPct, wantsPct, savingsPct } });
  revalidate();
  return { ok: true, message: "Budget saved." };
}

const paycheckSchema = z.object({
  paycheckAmount: moneyField,
  payFrequency: z.enum(PAY_FREQUENCIES, { error: "Pick a pay frequency" }),
  nextPayDate: z.string().min(1, "Pick your next pay date"),
});

export async function updatePaycheckSettings(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const userId = await requireUserId();
  const parsed = paycheckSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { paycheckAmount, payFrequency } = parsed.data;
  if (paycheckAmount < 0) return { ok: false, error: "Paycheck cannot be negative" };
  const nextPayDate = fromDateInput(parsed.data.nextPayDate);
  if (!nextPayDate) return { ok: false, error: "Enter a valid next pay date" };
  await prisma.user.update({ where: { id: userId }, data: { paycheckAmount, payFrequency, nextPayDate } });
  revalidate();
  return { ok: true, message: "Paycheck settings saved." };
}
