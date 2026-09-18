import Link from "next/link";
import { getDaysInMonth } from "date-fns";
import { requireUser } from "@/server/session";
import { getCategories, getMonthSummary } from "@/server/queries";
import { safeToSpend, type BucketSummary } from "@/lib/budget";
import { BUCKET_COLOR, BUCKET_DESCRIPTION, BUCKET_LABEL } from "@/lib/constants";
import { monthKey, monthLabel, parseMonthKey } from "@/lib/dates";
import { paycheckInfo, paydayLabel } from "@/lib/paycheck";
import { cn } from "@/lib/cn";
import { MonthNav } from "@/components/month-nav";
import { StatusPill } from "@/components/status-pill";
import { Callout, Card, CardHeader, CardTitle, LinkButton, Money, PageHeader, Progress } from "@/components/ui";
import { CategoryTable, type CategoryRow } from "./category-table";

const DOT: Record<string, string> = {
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
};

function pct(ratio: number): number {
  return Math.round(ratio * 100);
}

/** Plain-language pace hint for a bucket in the current month. */
function paceHint(b: BucketSummary, elapsed: number): { text: string; className: string } | null {
  if (b.target <= 0) return null;
  const used = b.spent / b.target;
  const detail = `${pct(used)}% used, ${pct(elapsed)}% of the month gone`;
  const savings = b.bucket === "SAVINGS_DEBT";
  if (used > elapsed + 0.1) {
    return savings
      ? { text: `Ahead of schedule. ${detail}.`, className: "text-emerald-600 dark:text-emerald-400" }
      : { text: `Ahead of pace. ${detail}.`, className: "text-amber-600 dark:text-amber-400" };
  }
  if (used < elapsed - 0.1) {
    return savings
      ? { text: `Behind schedule. ${detail}.`, className: "text-amber-600 dark:text-amber-400" }
      : { text: `Under pace. ${detail}.`, className: "text-emerald-600 dark:text-emerald-400" };
  }
  return { text: `On pace. ${detail}.`, className: "text-muted" };
}

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const { month: monthParam } = await searchParams;
  const today = new Date();
  const monthDate = parseMonthKey(monthParam);
  const month = monthKey(monthDate);
  const isCurrent = month === monthKey(today);
  const daysInMonth = getDaysInMonth(monthDate);
  const elapsed = isCurrent ? Math.min(1, today.getDate() / daysInMonth) : 1;

  const [{ summary }, categories] = await Promise.all([
    getMonthSummary(user, month),
    getCategories(user.id, { includeArchived: true }),
  ]);
  const iconById = new Map(categories.map((c) => [c.id, c.icon]));

  const totalPlanned = summary.buckets.reduce((s, b) => s + b.target, 0);
  const allSpent = summary.totalSpent + summary.uncategorizedSpent;
  const needsReview = summary.uncategorizedSpent > 0 || summary.unreviewedCount > 0;

  const pay = paycheckInfo(user, today);
  const needs = summary.buckets.find((b) => b.bucket === "NEEDS");
  const wants = summary.buckets.find((b) => b.bucket === "WANTS");
  const sts = isCurrent
    ? safeToSpend({
        needsRemaining: needs?.remaining ?? 0,
        wantsRemaining: wants?.remaining ?? 0,
        uncategorizedSpent: summary.uncategorizedSpent,
        daysUntilPaycheck: pay.daysUntilPaycheck,
        daysLeftInMonth: pay.daysLeftInMonth,
      })
    : null;

  return (
    <>
      <PageHeader title="Budget" description={`Your 50/30/20 plan for ${monthLabel(monthDate)}.`} actions={<MonthNav month={month} />} />

      {user.monthlyIncome === 0 && (
        <Callout
          tone="warn"
          title="Set your income to unlock your plan"
          className="mb-6"
          action={
            <LinkButton href="/settings" size="sm">
              Go to settings
            </LinkButton>
          }
        >
          Bucket targets are a share of your monthly take-home pay.
        </Callout>
      )}

      <Card className="mb-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Expected income" value={<Money cents={summary.expectedIncome} />} />
          <Stat label="Actual income" value={<Money cents={summary.actualIncome} />} />
          <Stat label="Planned" value={<Money cents={totalPlanned} />} />
          <Stat
            label="Spent"
            value={
              <span className="flex flex-wrap items-center gap-2">
                <Money cents={allSpent} className={cn(allSpent > totalPlanned && totalPlanned > 0 && "text-red-600 dark:text-red-400")} />
                <StatusPill status={summary.status} />
              </span>
            }
          />
        </div>
      </Card>

      {needsReview && (
        <Callout
          tone="warn"
          className="mb-6"
          action={
            <LinkButton href="/review" size="sm" variant="secondary">
              Review now
            </LinkButton>
          }
        >
          <Money cents={summary.uncategorizedSpent} className="font-semibold" /> across {summary.unreviewedCount} transaction
          {summary.unreviewedCount === 1 ? "" : "s"} still needs review. It counts against safe to spend until you sort it.
        </Callout>
      )}

      {sts && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Safe to spend</CardTitle>
            <span className="text-xs text-muted">Needs + Wants remaining, minus unreviewed spending</span>
          </CardHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <p className="text-sm text-muted">Until payday ({paydayLabel(pay)})</p>
              <Money cents={sts.untilPaycheck} colored={sts.untilPaycheck < 0} className="mt-1 block text-3xl font-semibold tracking-tight" />
            </div>
            <Stat label="Per day" value={<Money cents={sts.perDay} colored={sts.perDay < 0} />} />
            <Stat label="Left this month" value={<Money cents={sts.monthRemaining} colored={sts.monthRemaining < 0} />} hint={`${pay.daysLeftInMonth} days to go`} />
          </div>
        </Card>
      )}

      <div className="space-y-6">
        {summary.buckets.map((b) => {
          const family = BUCKET_COLOR[b.bucket];
          const hint = isCurrent ? paceHint(b, elapsed) : null;
          const rows: CategoryRow[] = summary.categories
            .filter((c) => c.bucket === b.bucket)
            .map((c) => ({ ...c, icon: iconById.get(c.categoryId) ?? "tag" }));
          return (
            <Card key={b.bucket}>
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", DOT[family])} aria-hidden />
                    <h2 className="font-semibold">{BUCKET_LABEL[b.bucket]}</h2>
                    <span className="ml-auto text-sm text-muted">{b.pct}%</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{BUCKET_DESCRIPTION[b.bucket]}</p>
                  <Progress pct={b.pct} color={family} className="mt-3" />
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Target</dt>
                      <dd className="font-medium">
                        <Money cents={b.target} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Spent</dt>
                      <dd className="font-medium">
                        <Money cents={b.spent} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{b.remaining < 0 ? "Over by" : "Remaining"}</dt>
                      <dd className={cn("font-medium", b.remaining < 0 && "text-red-600 dark:text-red-400")}>
                        <Money cents={Math.abs(b.remaining)} />
                      </dd>
                    </div>
                  </dl>
                  {hint && <p className={cn("mt-3 text-xs", hint.className)}>{hint.text}</p>}
                </div>
                <div className="md:col-span-2 md:border-l md:border-border md:pl-6">
                  <CategoryTable rows={rows} color={family} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Want a different split or new categories?{" "}
        <Link href="/settings" className="text-accent hover:underline">
          Settings
        </Link>{" "}
        ·{" "}
        <Link href="/categories" className="text-accent hover:underline">
          Categories
        </Link>
      </p>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
