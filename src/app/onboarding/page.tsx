import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { prisma } from "@/lib/prisma";
import { toDateInput } from "@/lib/dates";
import { PAY_FREQUENCIES, type PayFrequency } from "@/lib/constants";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Set up" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ redo?: string }> }) {
  const user = await requireUser();
  const { redo } = await searchParams;
  const isRedo = redo === "1";
  if (user.onboardedAt && !isRedo) redirect("/dashboard");

  const existingAccounts = await prisma.account.count({ where: { userId: user.id, archived: false } });
  const today = toDateInput(new Date());
  const payFrequency = (PAY_FREQUENCIES as readonly string[]).includes(user.payFrequency)
    ? (user.payFrequency as PayFrequency)
    : "BIWEEKLY";

  return (
    <OnboardingWizard
      defaults={{
        today,
        redo: isRedo && user.onboardedAt !== null,
        existingAccounts,
        monthlyIncome: user.monthlyIncome,
        paycheckAmount: user.paycheckAmount,
        payFrequency,
        nextPayDate: user.nextPayDate ? toDateInput(user.nextPayDate) : today,
        needsPct: user.needsPct,
        wantsPct: user.wantsPct,
        savingsPct: user.savingsPct,
      }}
    />
  );
}
