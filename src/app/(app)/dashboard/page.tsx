import Link from "next/link";
import { getDaysInMonth } from "date-fns";
import { requireUser } from "@/server/session";
import { getAccountsWithBalances, getGoalsWithProgress, getMonthSummary, toTxnLike } from "@/server/queries";
import { netWorth, safeToSpend, spendableCash } from "@/lib/budget";
import { BUCKET_COLOR, BUCKET_LABEL } from "@/lib/constants";
import { monthKey, shiftMonth } from "@/lib/dates";
import { generateInsights, type InsightTone, type InsightTxn } from "@/lib/insights";
import { paycheckInfo, paydayLabel } from "@/lib/paycheck";
import { cn } from "@/lib/cn";
import { CategoryIcon } from "@/components/category-icon";
import { GoalCard } from "@/components/goal-card";
import { Callout, Card, CardHeader, CardTitle, EmptyState, LinkButton, Money, Progress } from "@/components/ui";

const FILL: Record<string, string> = {
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  gray: "bg-gray-400 dark:bg-gray-500",
};

const INSIGHT_BORDER: Record<InsightTone, string> = {
  good: "border-l-emerald-500",
  warn: "border-l-amber-500",
  info: "border-l-sky-500",
};

function toInsightTxn(t: Parameters<typeof toTxnLike>[0] & { date: Date; payee: string }): InsightTxn {
  return { ...toTxnLike(t), date: t.date, payee: t.payee };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const today = new Date();
  const month = monthKey(today);
  const previousMonth = shiftMonth(month, -1);

  const [current, previous, accounts, goals] = await Promise.all([
    getMonthSummary(user, month),
    getMonthSummary(user, previousMonth),
    getAccountsWithBalances(user.id),
    getGoalsWithProgress(user.id),
  ]);
  const summary = current.summary;

  const pay = paycheckInfo(user, today);
  const needs = summary.buckets.find((b) => b.bucket === "NEEDS");
  const wants = summary.buckets.find((b) => b.bucket === "WANTS");
  const sts = safeToSpend({
    needsRemaining: needs?.remaining ?? 0,
    wantsRemaining: wants?.remaining ?? 0,
    uncategorizedSpent: summary.uncategorizedSpent,
    daysUntilPaycheck: pay.daysUntilPaycheck,
    daysLeftInMonth: pay.daysLeftInMonth,
  });

  const insights = generateInsights({
    current: summary,
    previous: previous.summary,
    transactions: current.transactions.map(toInsightTxn),
    previousTransactions: previous.transactions.map(toInsightTxn),
    today,
    daysInMonth: getDaysInMonth(today),
  });

  const hasIncome = user.monthlyIncome > 0;
  const totalPlanned = summary.buckets.reduce((s, b) => s + b.target, 0);
  const allSpent = summary.totalSpent + summary.uncategorizedSpent;
  const overBy = allSpent - totalPlanned;
  const firstName = user.name?.trim().split(/\s+/)[0] || "there";
  const statusSentence =
    summary.status === "under"
      ? "You're under budget this month."
      : summary.status === "on-track"
        ? "You're on track this month."
        : null;

  const spending = summary.needsSpent + summary.wantsSpent + summary.uncategorizedSpent;
  const saved = summary.savingsSpent;
  const flowMax = Math.max(summary.actualIncome, spending + saved, 1);
  const flowSegments = [
    { label: "Needs", cents: summary.needsSpent, fill: FILL.sky },
    { label: "Wants", cents: summary.wantsSpent, fill: FILL.violet },
    { label: "Unsorted", cents: summary.uncategorizedSpent, fill: FILL.gray },
    { label: "Saved", cents: saved, fill: FILL.emerald },
  ].filter((s) => s.cents > 0);

  const topCategories = summary.categories.filter((c) => c.spent > 0).slice(0, 5);
  const cash = spendableCash(accounts);
  const worth = netWorth(accounts);

  return (
    <div className="space-y-6">
      {!hasIncome && (
        <Callout
          tone="warn"
          title="Set your income to unlock your plan"
          action={
            <LinkButton href="/settings" size="sm">
              Set income
            </LinkButton>
          }
        >
          Securo splits your monthly take-home into Needs, Wants and Savings targets. Until you set it, there is nothing to measure against.
        </Callout>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Hero */}
        <Card className="md:col-span-2">
          <p className="text-sm text-muted">Hello, {firstName}</p>
          {hasIncome ? (
            <>
              <p className="mt-1 text-lg font-medium">
                {statusSentence ?? (
                  <>
                    You&apos;re over budget by <Money cents={overBy} className="text-red-600 dark:text-red-400" />.
                  </>
                )}
              </p>
              <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="text-sm text-muted">Safe to spend until payday ({paydayLabel(pay)})</p>
                  <Money
                    cents={sts.untilPaycheck}
                    className={cn("mt-1 block text-5xl font-semibold tracking-tight", sts.untilPaycheck < 0 && "text-red-600 dark:text-red-400")}
                  />
                </div>
                <dl className="flex gap-8 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Per day</dt>
                    <dd className="mt-0.5 text-lg font-semibold">
                      <Money cents={sts.perDay} colored={sts.perDay < 0} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Left this month</dt>
                    <dd className="mt-0.5 text-lg font-semibold">
                      <Money cents={sts.monthRemaining} colored={sts.monthRemaining < 0} />
                    </dd>
                  </div>
                </dl>
              </div>
            </>
          ) : (
            <p className="mt-1 text-lg font-medium">Your plan is waiting on an income figure.</p>
          )}
        </Card>

        {/* Review nudge */}
        {summary.unreviewedCount > 0 ? (
          <Callout
            tone="warn"
            className="md:col-span-2"
            title={`${summary.unreviewedCount} transaction${summary.unreviewedCount === 1 ? "" : "s"} to sort`}
            action={
              <LinkButton href="/review" size="sm">
                Review
              </LinkButton>
            }
          >
            <Money cents={summary.uncategorizedSpent} className="font-medium" /> is held out of your buckets until it is categorized.
          </Callout>
        ) : (
          <p className="text-sm text-muted md:col-span-2">All caught up. Nothing waiting for review.</p>
        )}

        {/* Bucket mini cards */}
        <div className="grid grid-cols-3 gap-3 md:col-span-2">
          {summary.buckets.map((b) => (
            <Link key={b.bucket} href="/budget" className="rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:bg-border/20 sm:p-4">
              <p className="truncate text-xs font-medium text-muted">{BUCKET_LABEL[b.bucket]}</p>
              <p className="mt-1 text-sm font-semibold sm:text-base">
                <Money cents={b.spent} />
              </p>
              <p className="text-xs text-muted">
                of <Money cents={b.target} />
              </p>
              <Progress pct={b.pct} color={BUCKET_COLOR[b.bucket]} className="mt-2 h-1.5" />
            </Link>
          ))}
        </div>

        {/* Cash flow */}
        <Card>
          <CardHeader>
            <CardTitle>Cash flow</CardTitle>
            <Link href="/transactions" className="text-xs font-medium text-accent hover:underline">
              Transactions
            </Link>
          </CardHeader>
          <div className="space-y-3">
            <FlowRow label="Income" cents={summary.actualIncome}>
              <div className={cn("h-full rounded-full", FILL.amber)} style={{ width: `${(summary.actualIncome / flowMax) * 100}%` }} />
            </FlowRow>
            <FlowRow label="Out" cents={spending + saved}>
              {flowSegments.map((s) => (
                <div key={s.label} className={cn("h-full", s.fill)} style={{ width: `${(s.cents / flowMax) * 100}%` }} title={s.label} />
              ))}
            </FlowRow>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <FlowStat label="Spending" cents={spending} dot={FILL.sky} />
            <FlowStat label="Saved" cents={saved} dot={FILL.emerald} />
            <div className="col-span-2 mt-1 flex items-center justify-between border-t border-border pt-2">
              <dt className="font-medium">Net</dt>
              <dd>
                <Money cents={summary.netCashFlow} signed colored className="font-semibold" />
              </dd>
            </div>
          </dl>
        </Card>

        {/* Top categories */}
        <Card>
          <CardHeader>
            <CardTitle>Top categories</CardTitle>
            <Link href="/budget" className="text-xs font-medium text-accent hover:underline">
              Budget
            </Link>
          </CardHeader>
          {topCategories.length === 0 ? (
            <p className="text-sm text-muted">No categorized spending yet this month.</p>
          ) : (
            <ul className="space-y-2.5">
              {topCategories.map((c) => {
                const share = summary.totalSpent > 0 ? (c.spent / summary.totalSpent) * 100 : 0;
                return (
                  <li key={c.categoryId}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{c.name}</span>
                      <Money cents={c.spent} className="font-medium" />
                    </div>
                    <Progress pct={share} color={BUCKET_COLOR[c.bucket]} className="mt-1 h-1.5" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Accounts */}
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <Link href="/accounts" className="text-xs font-medium text-accent hover:underline">
              All accounts
            </Link>
          </CardHeader>
          {accounts.length === 0 ? (
            <EmptyState
              title="No accounts yet"
              description="Add a checking account or connect your bank to see cash on hand."
              action={
                <LinkButton href="/accounts" size="sm">
                  Add an account
                </LinkButton>
              }
            />
          ) : (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Spendable cash</dt>
                <dd className="mt-1 text-xl font-semibold">
                  <Money cents={cash} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Net worth</dt>
                <dd className="mt-1 text-xl font-semibold">
                  <Money cents={worth} colored={worth < 0} />
                </dd>
              </div>
              <div className="col-span-2 text-xs text-muted">
                {accounts.length} account{accounts.length === 1 ? "" : "s"}
              </div>
            </dl>
          )}
        </Card>

        {/* Goals */}
        <Card>
          <CardHeader>
            <CardTitle>Goals</CardTitle>
            <Link href="/goals" className="text-xs font-medium text-accent hover:underline">
              All goals
            </Link>
          </CardHeader>
          {goals.length === 0 ? (
            <EmptyState
              title="No goals yet"
              description="Give your savings a name and a target."
              action={
                <LinkButton href="/goals" size="sm">
                  Create a goal
                </LinkButton>
              }
            />
          ) : (
            <div className="space-y-3">
              {goals.slice(0, 3).map((g) => (
                <GoalCard key={g.id} goal={g} compact className="p-3 shadow-none" />
              ))}
            </div>
          )}
        </Card>

        {/* Insights */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Insights</CardTitle>
          </CardHeader>
          {insights.length === 0 ? (
            <p className="text-sm text-muted">Nothing to flag yet. Insights appear once there is a little spending to compare.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {insights.map((i) => (
                <li key={i.id} className={cn("rounded-lg border border-border border-l-4 bg-background/40 px-4 py-3", INSIGHT_BORDER[i.tone])}>
                  <div className="flex items-center gap-2">
                    <CategoryIcon name={i.tone === "good" ? "sparkles" : i.tone === "warn" ? "zap" : "tag"} className="h-4 w-4 shrink-0 text-muted" />
                    <p className="text-sm font-semibold">{i.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted">{i.body}</p>
                  {i.href && (
                    <Link href={i.href} className="mt-1 inline-block text-xs font-medium text-accent hover:underline">
                      Take a look
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function FlowRow({ label, cents, children }: { label: string; cents: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <Money cents={cents} className="font-medium text-foreground" />
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-border">{children}</div>
    </div>
  );
}

function FlowStat({ label, cents, dot }: { label: string; cents: number; dot: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-2 text-muted">
        <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden />
        {label}
      </dt>
      <dd>
        <Money cents={cents} />
      </dd>
    </div>
  );
}
