/**
 * Plain-language insights derived from a month summary. Pure and dependency
 * free so every rule can be unit tested. Each rule is one small function that
 * returns zero or more ranked insights; generateInsights merges them, sorts
 * by importance and returns at most five.
 */
import type { MonthSummary, TxnLike } from "./budget";
import { BUCKET_LABEL } from "./constants";
import { formatShortDate } from "./dates";
import { formatMoney } from "./money";

export type InsightTone = "good" | "warn" | "info";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  body: string;
  href?: string;
}

export interface InsightTxn extends TxnLike {
  date: Date;
  payee: string;
}

export interface InsightInput {
  current: MonthSummary;
  previous: MonthSummary | null;
  /** Transactions for the current month. */
  transactions: InsightTxn[];
  /** Transactions for the previous month; used to spot recurring charges. */
  previousTransactions?: InsightTxn[];
  today: Date;
  daysInMonth: number;
  /** Pace rules only make sense while the month is in progress. Defaults to true. */
  isCurrentMonth?: boolean;
}

type Ranked = Insight & { priority: number };

export const MAX_INSIGHTS = 5;

const PACE_TOLERANCE = 0.1;
const JUMP_RATIO = 1.3;
const JUMP_MIN_CENTS = 2500;
const SUBSCRIPTION_TOLERANCE = 0.05;
const LARGE_MULTIPLE = 3;
const LARGE_MIN_CENTS = 10000;

function pct(ratio: number): number {
  return Math.round(ratio * 100);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Spending versus how much of the month has elapsed. Only Needs and Wants are
 * paced: putting money toward Savings & Debt early is never a warning, and an
 * untouched savings bucket is not good news.
 */
export function paceInsights(input: InsightInput): Ranked[] {
  if (input.isCurrentMonth === false || input.daysInMonth <= 0) return [];
  const elapsed = Math.min(1, Math.max(0, input.today.getDate() / input.daysInMonth));
  const out: Ranked[] = [];
  for (const b of input.current.buckets) {
    if (b.target <= 0 || b.bucket === "SAVINGS_DEBT") continue;
    const used = b.spent / b.target;
    const label = BUCKET_LABEL[b.bucket];
    const body = `${pct(used)}% used with ${pct(elapsed)}% of the month gone.`;
    if (used > elapsed + PACE_TOLERANCE) {
      out.push({
        id: `pace-${b.bucket}`,
        tone: "warn",
        priority: 10 - Math.min(9, (used - elapsed) * 10),
        title: `${label} is ahead of pace`,
        body,
        href: "/budget",
      });
    } else if (b.spent > 0 && elapsed >= 0.75 && used <= elapsed - PACE_TOLERANCE) {
      out.push({
        id: `pace-${b.bucket}`,
        tone: "good",
        priority: 80,
        title: `${label} is comfortably under pace`,
        body,
        href: "/budget",
      });
    }
  }
  return out;
}

/** The category with the biggest month-over-month increase, if it is a meaningful one. */
export function categoryJumpInsights(input: InsightInput): Ranked[] {
  if (!input.previous) return [];
  const prevById = new Map(input.previous.categories.map((c) => [c.categoryId, c.spent]));
  let best: { name: string; spent: number; prev: number } | null = null;
  for (const c of input.current.categories) {
    const prev = prevById.get(c.categoryId) ?? 0;
    if (prev <= 0) continue;
    const diff = c.spent - prev;
    if (diff < JUMP_MIN_CENTS || c.spent <= prev * JUMP_RATIO) continue;
    if (!best || diff > best.spent - best.prev) best = { name: c.name, spent: c.spent, prev };
  }
  if (!best) return [];
  const up = pct(best.spent / best.prev - 1);
  return [
    {
      id: "category-jump",
      tone: "warn",
      priority: 20,
      title: `${best.name} is up ${up}% on last month`,
      body: `${formatMoney(best.spent)} so far this month vs ${formatMoney(best.prev)} last month.`,
      href: "/transactions",
    },
  ];
}

function normalizePayee(payee: string): string {
  return payee.trim().toLowerCase();
}

/** Payees charged in both months for roughly the same amount. */
export function subscriptionInsights(input: InsightInput): Ranked[] {
  const previous = input.previousTransactions ?? [];
  if (previous.length === 0) return [];
  const prevByPayee = new Map<string, number[]>();
  for (const t of previous) {
    if (t.excluded || t.amount >= 0) continue;
    const key = normalizePayee(t.payee);
    prevByPayee.set(key, [...(prevByPayee.get(key) ?? []), -t.amount]);
  }
  const matched = new Map<string, { payee: string; amount: number }>();
  for (const t of input.transactions) {
    if (t.excluded || t.amount >= 0) continue;
    const key = normalizePayee(t.payee);
    if (matched.has(key)) continue;
    const amount = -t.amount;
    const candidates = prevByPayee.get(key);
    if (!candidates) continue;
    if (candidates.some((p) => Math.abs(p - amount) <= SUBSCRIPTION_TOLERANCE * Math.max(p, amount))) {
      matched.set(key, { payee: t.payee, amount });
    }
  }
  if (matched.size === 0) return [];
  const items = [...matched.values()].sort((a, b) => b.amount - a.amount);
  const total = items.reduce((s, i) => s + i.amount, 0);
  const names = items.slice(0, 3).map((i) => i.payee);
  const more = items.length - names.length;
  return [
    {
      id: "subscriptions",
      tone: "info",
      priority: 60,
      title: `${plural(items.length, "recurring charge")} add${items.length === 1 ? "s" : ""} up to ${formatMoney(total)}/month`,
      body: `${names.join(", ")}${more > 0 ? ` and ${more} more` : ""} charged you about the same last month.`,
      href: "/transactions",
    },
  ];
}

/** Outflows far above the month's typical transaction. */
export function largePurchaseInsights(input: InsightInput): Ranked[] {
  const outflows = input.transactions
    .filter((t) => !t.excluded && t.amount < 0)
    .map((t) => ({ txn: t, abs: -t.amount }))
    .sort((a, b) => a.abs - b.abs);
  if (outflows.length === 0) return [];
  const mid = Math.floor(outflows.length / 2);
  const median =
    outflows.length % 2 === 1 ? outflows[mid].abs : Math.round((outflows[mid - 1].abs + outflows[mid].abs) / 2);
  const big = outflows.filter((o) => o.abs > LARGE_MULTIPLE * median && o.abs >= LARGE_MIN_CENTS);
  if (big.length === 0) return [];
  const largest = big[big.length - 1];
  return [
    {
      id: "large-purchase",
      tone: "info",
      priority: 50,
      title: big.length === 1 ? "One large purchase this month" : `${big.length} large purchases this month`,
      body: `${formatMoney(largest.abs)} at ${largest.txn.payee} on ${formatShortDate(largest.txn.date)}, well above your typical ${formatMoney(median)} transaction.`,
      href: "/transactions",
    },
  ];
}

/** Share of actual income that went to Savings & Debt. */
export function savingsRateInsights(input: InsightInput): Ranked[] {
  const { current } = input;
  if (current.actualIncome <= 0 || current.expectedIncome <= 0) return [];
  const bucket = current.buckets.find((b) => b.bucket === "SAVINGS_DEBT");
  if (!bucket || bucket.target <= 0) return [];
  const targetRate = bucket.target / current.expectedIncome;
  const rate = current.savingsSpent / current.actualIncome;
  if (rate >= targetRate) {
    return [
      {
        id: "savings-rate",
        tone: "good",
        priority: 70,
        title: `You're saving ${pct(rate)}% of your income`,
        body: `${formatMoney(current.savingsSpent)} has gone to Savings & Debt this month, meeting your ${pct(targetRate)}% target.`,
        href: "/goals",
      },
    ];
  }
  if (rate < targetRate / 2) {
    return [
      {
        id: "savings-rate",
        tone: "warn",
        priority: 30,
        title: `Savings rate is ${pct(rate)}%, below your ${pct(targetRate)}% target`,
        body: `Only ${formatMoney(current.savingsSpent)} of ${formatMoney(current.actualIncome)} income has gone to Savings & Debt so far.`,
        href: "/goals",
      },
    ];
  }
  return [];
}

/** Anything still in the review queue skews the numbers. */
export function reviewNudgeInsights(input: InsightInput): Ranked[] {
  const n = input.current.unreviewedCount;
  if (n <= 0) return [];
  return [
    {
      id: "review",
      tone: "info",
      priority: 40,
      title: `${plural(n, "transaction")} to sort`,
      body: "Uncategorized spending is held out of your buckets until you review it.",
      href: "/review",
    },
  ];
}

const RULES: ((input: InsightInput) => Ranked[])[] = [
  paceInsights,
  categoryJumpInsights,
  savingsRateInsights,
  reviewNudgeInsights,
  largePurchaseInsights,
  subscriptionInsights,
];

export function generateInsights(input: InsightInput): Insight[] {
  return RULES.flatMap((rule) => rule(input))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_INSIGHTS)
    .map(({ id, tone, title, body, href }) => (href ? { id, tone, title, body, href } : { id, tone, title, body }));
}
