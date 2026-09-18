import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/server/session";
import { getGoalDetail } from "@/server/queries";
import { archiveGoal, deleteContribution, deleteGoal, unarchiveGoal } from "@/server/actions/goals";
import { goalProgress } from "@/lib/budget";
import { formatDate, toDateInput } from "@/lib/dates";
import { GOAL_COLOR_CLASSES, GOAL_KIND_LABEL, goalColor, goalKind, goalVerb } from "@/lib/goals";
import { cn } from "@/lib/cn";
import { CategoryIcon } from "@/components/category-icon";
import { Badge, Button, Card, CardHeader, CardTitle, Money, Progress } from "@/components/ui";
import { GoalForm } from "../goal-form";
import { ConfirmForm } from "../confirm-form";
import { ContributionForm } from "./contribution-form";

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const goal = await getGoalDetail(user.id, id);
  if (!goal) notFound();

  const progress = goalProgress(goal);
  const color = GOAL_COLOR_CLASSES[goalColor(goal.color)];
  const kind = goalKind(goal.kind);
  const verb = goalVerb(goal.kind);

  return (
    <>
      <Link href="/goals" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden /> All goals
      </Link>

      <Card className="mb-6">
        <div className="flex items-start gap-4">
          <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-xl", color.chip)}>
            <CategoryIcon name={goal.icon} className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{goal.name}</h1>
              <Badge tone={kind === "DEBT" ? "amber" : "emerald"}>{GOAL_KIND_LABEL[kind]}</Badge>
              {goal.archived && <Badge>Archived</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">
              <Money cents={goal.saved} className="text-lg font-semibold text-foreground" /> of <Money cents={goal.targetAmount} /> {verb}
              {progress.remaining > 0 && (
                <>
                  {" "}
                  · <Money cents={progress.remaining} /> to go
                </>
              )}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Progress pct={progress.pct} color={color.bar} className="h-3 flex-1" />
          <span className="tabular w-12 text-right text-sm font-medium">{progress.pct}%</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Target date</dt>
            <dd className="mt-0.5 font-medium">{goal.targetDate ? formatDate(goal.targetDate) : "None"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Months left</dt>
            <dd className="mt-0.5 font-medium">{progress.monthsLeft ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">{kind === "DEBT" ? "Pay per month" : "Save per month"}</dt>
            <dd className="mt-0.5 font-medium">
              {progress.remaining === 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400">Done</span>
              ) : progress.monthlyNeeded !== null ? (
                <Money cents={progress.monthlyNeeded} />
              ) : (
                "Set a target date"
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{kind === "DEBT" ? "Record a payment" : "Add contribution"}</CardTitle>
          </CardHeader>
          <ContributionForm goalId={goal.id} today={toDateInput(new Date())} isDebt={kind === "DEBT"} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <span className="text-xs text-muted">
              {goal.contributions.length} entr{goal.contributions.length === 1 ? "y" : "ies"}
            </span>
          </CardHeader>
          {goal.contributions.length === 0 ? (
            <p className="text-sm text-muted">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {goal.contributions.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{c.note || (c.amount < 0 ? (kind === "DEBT" ? "Charge" : "Withdrawal") : kind === "DEBT" ? "Payment" : "Contribution")}</p>
                    <p className="text-xs text-muted">{formatDate(c.date)}</p>
                  </div>
                  <Money cents={c.amount} signed colored className="text-sm font-medium" />
                  <ConfirmForm action={deleteContribution.bind(null, c.id)} message="Delete this entry?">
                    <button type="submit" className="text-xs text-muted hover:text-red-600" aria-label="Delete entry">
                      Delete
                    </button>
                  </ConfirmForm>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <details className="group mt-6 rounded-xl border border-border bg-card shadow-sm">
        <summary className="cursor-pointer list-none px-5 py-4 font-medium">Edit goal</summary>
        <div className="border-t border-border px-5 py-5">
          <GoalForm
            goal={{
              id: goal.id,
              name: goal.name,
              kind: goal.kind,
              targetAmount: goal.targetAmount,
              targetDate: goal.targetDate ? toDateInput(goal.targetDate) : "",
              icon: goal.icon,
              color: goal.color,
            }}
          />
        </div>
      </details>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <form action={(goal.archived ? unarchiveGoal : archiveGoal).bind(null, goal.id)}>
          <Button type="submit" variant="secondary" size="sm">
            {goal.archived ? "Unarchive" : "Archive"}
          </Button>
        </form>
        <ConfirmForm action={deleteGoal.bind(null, goal.id)} message={`Delete "${goal.name}" and all of its history? This cannot be undone.`}>
          <Button type="submit" variant="danger" size="sm">
            Delete goal
          </Button>
        </ConfirmForm>
      </div>
    </>
  );
}
