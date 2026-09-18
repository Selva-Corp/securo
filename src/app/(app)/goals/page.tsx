import Link from "next/link";
import { requireUser } from "@/server/session";
import { getGoalsWithProgress } from "@/server/queries";
import { unarchiveGoal } from "@/server/actions/goals";
import { GoalCard } from "@/components/goal-card";
import { CategoryIcon } from "@/components/category-icon";
import { Button, Card, CardHeader, CardTitle, EmptyState, Money, PageHeader, Progress } from "@/components/ui";
import { GoalForm } from "./goal-form";

export default async function GoalsPage() {
  const user = await requireUser();
  const goals = await getGoalsWithProgress(user.id, { includeArchived: true });
  const active = goals.filter((g) => !g.archived);
  const archived = goals.filter((g) => g.archived);

  const totalSaved = active.reduce((s, g) => s + g.saved, 0);
  const totalTarget = active.reduce((s, g) => s + g.targetAmount, 0);
  const totalPct = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

  return (
    <>
      <PageHeader title="Goals" description="Savings targets and debts you are paying down." />

      {active.length > 0 && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <CardTitle>Across {active.length} active goal{active.length === 1 ? "" : "s"}</CardTitle>
              <p className="mt-1 text-2xl font-semibold tracking-tight">
                <Money cents={totalSaved} /> <span className="text-base font-normal text-muted">of</span> <Money cents={totalTarget} />
              </p>
            </div>
            <p className="text-sm text-muted">
              <Money cents={Math.max(0, totalTarget - totalSaved)} /> to go
            </p>
          </div>
          <Progress pct={totalPct} color="emerald" className="mt-4" />
        </Card>
      )}

      {active.length === 0 ? (
        <EmptyState title="No goals yet" description="Name something you are saving for or paying off, and Securo will track it against your Savings & Debt bucket." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {active.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </div>
      )}

      <details className="group mt-6 rounded-xl border border-border bg-card shadow-sm" open={active.length === 0}>
        <summary className="cursor-pointer list-none px-5 py-4 font-medium marker:hidden">
          <span className="group-open:hidden">+ New goal</span>
          <span className="hidden group-open:inline">New goal</span>
        </summary>
        <div className="border-t border-border px-5 py-5">
          <GoalForm />
        </div>
      </details>

      {archived.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Archived</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-border">
            {archived.map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-2.5">
                <span className="text-muted">
                  <CategoryIcon name={g.icon} />
                </span>
                <Link href={`/goals/${g.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                  {g.name}
                </Link>
                <span className="text-sm text-muted">
                  <Money cents={g.saved} /> of <Money cents={g.targetAmount} />
                </span>
                <form action={unarchiveGoal.bind(null, g.id)}>
                  <Button type="submit" variant="secondary" size="sm">
                    Unarchive
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
