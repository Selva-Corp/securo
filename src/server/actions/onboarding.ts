"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/session";
import { ACCOUNT_TYPES, PAY_FREQUENCIES } from "@/lib/constants";
import { splitIsValid } from "@/lib/budget";
import { fromDateInput } from "@/lib/dates";

const pct = z.number().int().min(0).max(100);

const schema = z.object({
  monthlyIncome: z.number().int().min(1, "Enter your monthly take-home income"),
  paycheckAmount: z.number().int().min(0),
  payFrequency: z.enum(PAY_FREQUENCIES),
  nextPayDate: z.string().min(1, "Pick your next pay date"),
  needsPct: pct,
  wantsPct: pct,
  savingsPct: pct,
  accounts: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Give each account a name").max(80),
        type: z.enum(ACCOUNT_TYPES),
        balance: z.number().int(),
        inSpendable: z.boolean(),
      }),
    )
    .max(50),
});

export type OnboardingInput = z.input<typeof schema>;
export type OnboardingState = { error: string } | undefined;

/**
 * Saves the wizard's answers in one go, creates any manual accounts, marks the
 * user onboarded, and sends them to the dashboard.
 */
export async function completeOnboarding(input: OnboardingInput): Promise<OnboardingState> {
  const userId = await requireUserId();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  if (!splitIsValid(data.needsPct, data.wantsPct, data.savingsPct)) {
    return { error: "Your split needs to add up to exactly 100%" };
  }
  const nextPayDate = fromDateInput(data.nextPayDate);
  if (!nextPayDate) return { error: "Enter a valid next pay date" };

  await prisma.user.update({
    where: { id: userId },
    data: {
      monthlyIncome: data.monthlyIncome,
      paycheckAmount: data.paycheckAmount,
      payFrequency: data.payFrequency,
      nextPayDate,
      needsPct: data.needsPct,
      wantsPct: data.wantsPct,
      savingsPct: data.savingsPct,
      onboardedAt: new Date(),
      accounts: {
        create: data.accounts.map((a) => ({
          name: a.name,
          type: a.type,
          openingBalance: a.balance,
          inSpendable: a.inSpendable,
        })),
      },
    },
  });

  for (const p of ["/dashboard", "/accounts", "/budget", "/settings", "/transactions"]) revalidatePath(p);
  redirect("/dashboard");
}
