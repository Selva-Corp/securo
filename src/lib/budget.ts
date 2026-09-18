/**
 * Pure budgeting math. No database access here so it is easy to test.
 * All amounts are integer cents. Outflows are negative on transactions;
 * the summaries below report spending as positive numbers.
 */
import { pctOf } from "./money";
import {
  PAYCHECKS_PER_MONTH,
  SPENDING_BUCKETS,
  type Bucket,
  type PayFrequency,
  type SpendingBucket,
} from "./constants";

export interface BudgetSettings {
  monthlyIncome: number;
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
}

export interface TxnLike {
  amount: number;
  excluded: boolean;
  categoryId: string | null;
  reviewedAt: Date | null;
  bucket: Bucket | null; // resolved from the category, null when uncategorized
  categoryName?: string | null;
}

export interface BucketSummary {
  bucket: SpendingBucket;
  target: number;
  spent: number;
  remaining: number; // target - spent, can be negative
  pct: number; // 0..100+ of target used
}

export interface CategorySummary {
  categoryId: string;
  name: string;
  bucket: Bucket;
  spent: number;
  limit: number | null;
}

export interface MonthSummary {
  expectedIncome: number;
  actualIncome: number;
  totalSpent: number; // all spending buckets
  needsSpent: number;
  wantsSpent: number;
  savingsSpent: number;
  uncategorizedSpent: number;
  unreviewedCount: number;
  buckets: BucketSummary[];
  categories: CategorySummary[];
  netCashFlow: number; // actualIncome - totalSpent - uncategorized
  status: "under" | "on-track" | "over";
}

export function bucketTargets(settings: BudgetSettings): Record<SpendingBucket, number> {
  return {
    NEEDS: pctOf(settings.monthlyIncome, settings.needsPct),
    WANTS: pctOf(settings.monthlyIncome, settings.wantsPct),
    SAVINGS_DEBT: pctOf(settings.monthlyIncome, settings.savingsPct),
  };
}

export function paycheckToMonthly(paycheck: number, frequency: PayFrequency): number {
  return Math.round(paycheck * PAYCHECKS_PER_MONTH[frequency]);
}

export function splitIsValid(needs: number, wants: number, savings: number): boolean {
  return [needs, wants, savings].every((p) => Number.isInteger(p) && p >= 0) && needs + wants + savings === 100;
}

/** Sum outflows (as a positive number) for transactions matching a predicate. */
function spentWhere(txns: TxnLike[], pred: (t: TxnLike) => boolean): number {
  let total = 0;
  for (const t of txns) {
    if (t.excluded) continue;
    if (!pred(t)) continue;
    // Refunds in a spending category reduce spending, so we sum signed and negate.
    total += -t.amount;
  }
  return total;
}

export function summarizeMonth(
  settings: BudgetSettings,
  txns: TxnLike[],
  categories: { id: string; name: string; bucket: Bucket; monthlyLimit: number | null }[],
): MonthSummary {
  const targets = bucketTargets(settings);
  const actualIncome = txns
    .filter((t) => !t.excluded && t.bucket === "INCOME")
    .reduce((s, t) => s + t.amount, 0);

  const spentByBucket: Record<SpendingBucket, number> = {
    NEEDS: spentWhere(txns, (t) => t.bucket === "NEEDS"),
    WANTS: spentWhere(txns, (t) => t.bucket === "WANTS"),
    SAVINGS_DEBT: spentWhere(txns, (t) => t.bucket === "SAVINGS_DEBT"),
  };
  // Uncategorized outflows only; uncategorized inflows are not counted anywhere.
  const uncategorizedSpent = spentWhere(txns, (t) => t.bucket === null && t.amount < 0);

  const buckets: BucketSummary[] = SPENDING_BUCKETS.map((bucket) => {
    const target = targets[bucket];
    const spent = spentByBucket[bucket];
    return {
      bucket,
      target,
      spent,
      remaining: target - spent,
      pct: target > 0 ? Math.round((spent / target) * 100) : spent > 0 ? 100 : 0,
    };
  });

  const spentByCategory = new Map<string, number>();
  for (const t of txns) {
    if (t.excluded || !t.categoryId || t.bucket === "INCOME") continue;
    spentByCategory.set(t.categoryId, (spentByCategory.get(t.categoryId) ?? 0) - t.amount);
  }
  const categorySummaries: CategorySummary[] = categories
    .filter((c) => c.bucket !== "INCOME")
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      bucket: c.bucket,
      spent: spentByCategory.get(c.id) ?? 0,
      limit: c.monthlyLimit,
    }))
    .sort((a, b) => b.spent - a.spent);

  const totalSpent = spentByBucket.NEEDS + spentByBucket.WANTS + spentByBucket.SAVINGS_DEBT;
  const totalBudget = targets.NEEDS + targets.WANTS + targets.SAVINGS_DEBT;
  const allSpent = totalSpent + uncategorizedSpent;

  let status: MonthSummary["status"] = "under";
  if (totalBudget > 0) {
    const ratio = allSpent / totalBudget;
    if (ratio > 1) status = "over";
    else if (ratio > 0.9) status = "on-track";
  } else if (allSpent > 0) {
    status = "over";
  }

  return {
    expectedIncome: settings.monthlyIncome,
    actualIncome,
    totalSpent,
    needsSpent: spentByBucket.NEEDS,
    wantsSpent: spentByBucket.WANTS,
    savingsSpent: spentByBucket.SAVINGS_DEBT,
    uncategorizedSpent,
    unreviewedCount: txns.filter((t) => t.reviewedAt === null).length,
    buckets,
    categories: categorySummaries,
    netCashFlow: actualIncome - allSpent,
    status,
  };
}

export interface SafeToSpendInput {
  /** Needs + Wants remaining this month (excluding savings, which is committed). */
  needsRemaining: number;
  wantsRemaining: number;
  uncategorizedSpent: number;
  /** Days until the next paycheck lands (>= 1). */
  daysUntilPaycheck: number;
  /** Days left in the budget month (>= 1). */
  daysLeftInMonth: number;
}

export interface SafeToSpend {
  /** Flexible money left for the month after needs, wants, and uncategorized spending. */
  monthRemaining: number;
  /** Portion of that you can spend before the next paycheck without going over. */
  untilPaycheck: number;
  perDay: number;
}

/**
 * "Safe to spend" spreads what is left of Needs + Wants evenly across the
 * remaining days in the month, then reports how much of it belongs to the
 * window before the next paycheck. Savings is intentionally left out: it is a
 * commitment, not spendable money.
 */
export function safeToSpend(input: SafeToSpendInput): SafeToSpend {
  const monthRemaining = input.needsRemaining + input.wantsRemaining - input.uncategorizedSpent;
  const daysLeft = Math.max(1, input.daysLeftInMonth);
  const perDay = Math.floor(monthRemaining / daysLeft);
  const window = Math.min(Math.max(1, input.daysUntilPaycheck), daysLeft);
  const untilPaycheck = monthRemaining <= 0 ? monthRemaining : Math.min(monthRemaining, perDay * window);
  return { monthRemaining, untilPaycheck, perDay: Math.max(perDay, monthRemaining <= 0 ? perDay : 0) };
}

export interface AccountLike {
  type: string;
  openingBalance: number;
  inSpendable: boolean;
  archived: boolean;
  txnSum: number;
  /** Provider-reported balance for synced accounts; wins over the computed one. */
  syncedBalance?: number | null;
}

export function accountBalance(a: AccountLike): number {
  if (a.syncedBalance !== null && a.syncedBalance !== undefined) return a.syncedBalance;
  return a.openingBalance + a.txnSum;
}

/** Cash on hand across spendable, non-archived asset accounts. */
export function spendableCash(accounts: AccountLike[]): number {
  return accounts
    .filter((a) => a.inSpendable && !a.archived && a.type !== "CREDIT" && a.type !== "LOAN")
    .reduce((s, a) => s + accountBalance(a), 0);
}

export function netWorth(accounts: AccountLike[]): number {
  return accounts.filter((a) => !a.archived).reduce((s, a) => s + accountBalance(a), 0);
}

export interface GoalLike {
  targetAmount: number;
  saved: number;
  targetDate: Date | null;
}

export interface GoalProgress {
  saved: number;
  remaining: number;
  pct: number;
  /** Suggested monthly contribution to hit the target date, null when no date or already done. */
  monthlyNeeded: number | null;
  monthsLeft: number | null;
}

export function goalProgress(goal: GoalLike, now = new Date()): GoalProgress {
  const remaining = Math.max(0, goal.targetAmount - goal.saved);
  const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.saved / goal.targetAmount) * 100)) : 0;
  let monthsLeft: number | null = null;
  let monthlyNeeded: number | null = null;
  if (goal.targetDate) {
    const months =
      (goal.targetDate.getFullYear() - now.getFullYear()) * 12 + (goal.targetDate.getMonth() - now.getMonth());
    monthsLeft = Math.max(0, months);
    monthlyNeeded = remaining === 0 ? null : Math.ceil(remaining / Math.max(1, monthsLeft));
  }
  return { saved: goal.saved, remaining, pct, monthlyNeeded, monthsLeft };
}
