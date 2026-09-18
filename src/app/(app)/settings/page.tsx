import type { Metadata } from "next";
import { LogOut, RotateCcw } from "lucide-react";
import { requireUser } from "@/server/session";
import { logout } from "@/server/actions/auth";
import { toDateInput } from "@/lib/dates";
import { PAY_FREQUENCIES, type PayFrequency } from "@/lib/constants";
import { Button, Card, CardHeader, CardTitle, LinkButton, PageHeader } from "@/components/ui";
import { ProfileForm } from "./profile-form";
import { BudgetForm } from "./budget-form";
import { PaycheckForm } from "./paycheck-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const payFrequency = (PAY_FREQUENCIES as readonly string[]).includes(user.payFrequency)
    ? (user.payFrequency as PayFrequency)
    : "BIWEEKLY";
  const today = toDateInput(new Date());

  return (
    <div>
      <PageHeader title="Settings" description="Your profile, your plan, and your paycheck." />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <ProfileForm name={user.name ?? ""} email={user.email} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget</CardTitle>
          </CardHeader>
          <BudgetForm
            monthlyIncome={user.monthlyIncome}
            needsPct={user.needsPct}
            wantsPct={user.wantsPct}
            savingsPct={user.savingsPct}
            paycheckAmount={user.paycheckAmount}
            payFrequency={payFrequency}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paycheck</CardTitle>
          </CardHeader>
          <PaycheckForm
            paycheckAmount={user.paycheckAmount}
            payFrequency={payFrequency}
            nextPayDate={user.nextPayDate ? toDateInput(user.nextPayDate) : null}
            today={today}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data</CardTitle>
          </CardHeader>
          <div className="divide-y divide-border">
            <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Re-run onboarding</p>
                <p className="text-sm text-muted">Walk through income, plan, and accounts again. Nothing is deleted.</p>
              </div>
              <LinkButton href="/onboarding?redo=1" variant="secondary" size="sm">
                <RotateCcw className="h-4 w-4" aria-hidden /> Re-run onboarding
              </LinkButton>
            </div>
            <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Sign out</p>
                <p className="text-sm text-muted">Signed in as {user.email}.</p>
              </div>
              <form action={logout}>
                <Button type="submit" variant="secondary" size="sm">
                  <LogOut className="h-4 w-4" aria-hidden /> Sign out
                </Button>
              </form>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
