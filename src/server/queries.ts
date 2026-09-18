/**
 * Shared read queries. Every function takes the userId explicitly so callers
 * can never forget to scope by user.
 */
import { prisma } from "@/lib/prisma";
import { monthRange, parseMonthKey } from "@/lib/dates";
import {
  accountBalance,
  summarizeMonth,
  type AccountLike,
  type MonthSummary,
  type TxnLike,
} from "@/lib/budget";
import type { Bucket } from "@/lib/constants";

export async function getCategories(userId: string, opts: { includeArchived?: boolean } = {}) {
  return prisma.category.findMany({
    where: { userId, ...(opts.includeArchived ? {} : { archived: false }) },
    orderBy: [{ bucket: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export type AccountWithBalance = Awaited<ReturnType<typeof getAccountsWithBalances>>[number];

export async function getAccountsWithBalances(userId: string, opts: { includeArchived?: boolean } = {}) {
  const [accounts, sums] = await Promise.all([
    prisma.account.findMany({
      where: { userId, ...(opts.includeArchived ? {} : { archived: false }) },
      orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
    }),
    prisma.transaction.groupBy({
      by: ["accountId"],
      where: { userId },
      _sum: { amount: true },
    }),
  ]);
  const sumByAccount = new Map(sums.map((s) => [s.accountId, s._sum.amount ?? 0]));
  return accounts.map((a) => {
    const like: AccountLike = { ...a, txnSum: sumByAccount.get(a.id) ?? 0 };
    return { ...a, balance: accountBalance(like), txnSum: like.txnSum };
  });
}

export type MonthTransaction = Awaited<ReturnType<typeof getMonthTransactions>>[number];

export async function getMonthTransactions(userId: string, monthKeyValue?: string) {
  const { start, end } = monthRange(parseMonthKey(monthKeyValue));
  return prisma.transaction.findMany({
    where: { userId, date: { gte: start, lte: end } },
    include: { category: true, account: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export function toTxnLike(t: { amount: number; excluded: boolean; categoryId: string | null; reviewedAt: Date | null; category: { bucket: string; name: string } | null }): TxnLike {
  return {
    amount: t.amount,
    excluded: t.excluded,
    categoryId: t.categoryId,
    reviewedAt: t.reviewedAt,
    bucket: (t.category?.bucket as Bucket | undefined) ?? null,
    categoryName: t.category?.name ?? null,
  };
}

/** Full month summary for the budget page and dashboard. */
export async function getMonthSummary(
  user: { id: string; monthlyIncome: number; needsPct: number; wantsPct: number; savingsPct: number },
  monthKeyValue?: string,
): Promise<{ summary: MonthSummary; transactions: MonthTransaction[] }> {
  const [transactions, categories] = await Promise.all([
    getMonthTransactions(user.id, monthKeyValue),
    getCategories(user.id, { includeArchived: true }),
  ]);
  const summary = summarizeMonth(
    user,
    transactions.map(toTxnLike),
    categories.map((c) => ({ id: c.id, name: c.name, bucket: c.bucket as Bucket, monthlyLimit: c.monthlyLimit })),
  );
  return { summary, transactions };
}

export async function getReviewQueue(userId: string, limit = 50) {
  return prisma.transaction.findMany({
    where: { userId, reviewedAt: null },
    include: { account: true, category: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
}

export async function getGoalsWithProgress(userId: string, opts: { includeArchived?: boolean } = {}) {
  const [goals, sums] = await Promise.all([
    prisma.goal.findMany({
      where: { userId, ...(opts.includeArchived ? {} : { archived: false }) },
      orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
    }),
    prisma.goalContribution.groupBy({ by: ["goalId"], where: { userId }, _sum: { amount: true } }),
  ]);
  const savedByGoal = new Map(sums.map((s) => [s.goalId, s._sum.amount ?? 0]));
  return goals.map((g) => ({ ...g, saved: savedByGoal.get(g.id) ?? 0 }));
}

export type GoalDetail = NonNullable<Awaited<ReturnType<typeof getGoalDetail>>>;

/** One goal with its contributions, newest first. Null when it is not the user's. */
export async function getGoalDetail(userId: string, goalId: string) {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    include: { contributions: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] } },
  });
  if (!goal) return null;
  const saved = goal.contributions.reduce((s, c) => s + c.amount, 0);
  return { ...goal, saved };
}
