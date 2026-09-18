import { describe, expect, it } from "vitest";
import {
  bucketTargets,
  goalProgress,
  netWorth,
  paycheckToMonthly,
  safeToSpend,
  spendableCash,
  splitIsValid,
  summarizeMonth,
  type TxnLike,
} from "./budget";

const settings = { monthlyIncome: 400000, needsPct: 50, wantsPct: 30, savingsPct: 20 };

function txn(partial: Partial<TxnLike> & { amount: number }): TxnLike {
  return {
    excluded: false,
    categoryId: "c",
    reviewedAt: new Date(),
    bucket: "NEEDS",
    ...partial,
  };
}

describe("bucketTargets", () => {
  it("splits income by percentage", () => {
    expect(bucketTargets(settings)).toEqual({ NEEDS: 200000, WANTS: 120000, SAVINGS_DEBT: 80000 });
  });

  it("rounds to the nearest cent", () => {
    expect(bucketTargets({ monthlyIncome: 100001, needsPct: 50, wantsPct: 30, savingsPct: 20 })).toEqual({
      NEEDS: 50001,
      WANTS: 30000,
      SAVINGS_DEBT: 20000,
    });
  });
});

describe("paycheckToMonthly", () => {
  it("converts biweekly pay to a monthly figure", () => {
    expect(paycheckToMonthly(100000, "BIWEEKLY")).toBe(216667);
  });
  it("leaves monthly pay unchanged", () => {
    expect(paycheckToMonthly(100000, "MONTHLY")).toBe(100000);
  });
});

describe("splitIsValid", () => {
  it("accepts splits that sum to 100", () => {
    expect(splitIsValid(50, 30, 20)).toBe(true);
    expect(splitIsValid(60, 20, 20)).toBe(true);
  });
  it("rejects splits that do not sum to 100 or are negative", () => {
    expect(splitIsValid(50, 30, 10)).toBe(false);
    expect(splitIsValid(110, -10, 0)).toBe(false);
    expect(splitIsValid(50.5, 29.5, 20)).toBe(false);
  });
});

describe("summarizeMonth", () => {
  const categories = [
    { id: "rent", name: "Rent", bucket: "NEEDS" as const, monthlyLimit: null },
    { id: "fun", name: "Fun", bucket: "WANTS" as const, monthlyLimit: 50000 },
    { id: "pay", name: "Paycheck", bucket: "INCOME" as const, monthlyLimit: null },
  ];

  it("totals spending per bucket and reports remaining", () => {
    const txns = [
      txn({ amount: -150000, categoryId: "rent", bucket: "NEEDS" }),
      txn({ amount: -20000, categoryId: "fun", bucket: "WANTS" }),
      txn({ amount: 400000, categoryId: "pay", bucket: "INCOME" }),
    ];
    const s = summarizeMonth(settings, txns, categories);
    expect(s.actualIncome).toBe(400000);
    expect(s.needsSpent).toBe(150000);
    expect(s.wantsSpent).toBe(20000);
    expect(s.savingsSpent).toBe(0);
    expect(s.totalSpent).toBe(170000);
    expect(s.buckets.find((b) => b.bucket === "NEEDS")).toMatchObject({ target: 200000, spent: 150000, remaining: 50000, pct: 75 });
    expect(s.netCashFlow).toBe(230000);
    expect(s.status).toBe("under");
  });

  it("treats refunds as negative spending and ignores excluded rows", () => {
    const txns = [
      txn({ amount: -10000, categoryId: "fun", bucket: "WANTS" }),
      txn({ amount: 3000, categoryId: "fun", bucket: "WANTS" }),
      txn({ amount: -99999, categoryId: "fun", bucket: "WANTS", excluded: true }),
    ];
    const s = summarizeMonth(settings, txns, categories);
    expect(s.wantsSpent).toBe(7000);
    expect(s.categories.find((c) => c.categoryId === "fun")?.spent).toBe(7000);
  });

  it("counts uncategorized outflows separately and unreviewed rows", () => {
    const txns = [
      txn({ amount: -5000, categoryId: null, bucket: null, reviewedAt: null }),
      txn({ amount: 5000, categoryId: null, bucket: null, reviewedAt: null }),
    ];
    const s = summarizeMonth(settings, txns, categories);
    expect(s.uncategorizedSpent).toBe(5000);
    expect(s.unreviewedCount).toBe(2);
    expect(s.totalSpent).toBe(0);
  });

  it("flags over budget when total spending exceeds the plan", () => {
    const txns = [txn({ amount: -450000, categoryId: "rent", bucket: "NEEDS" })];
    expect(summarizeMonth(settings, txns, categories).status).toBe("over");
  });

  it("flags on-track when within 10% of the plan", () => {
    const txns = [txn({ amount: -380000, categoryId: "rent", bucket: "NEEDS" })];
    expect(summarizeMonth(settings, txns, categories).status).toBe("on-track");
  });

  it("handles a zero income without dividing by zero", () => {
    const s = summarizeMonth({ ...settings, monthlyIncome: 0 }, [txn({ amount: -100 })], categories);
    expect(s.buckets[0].pct).toBe(100);
    expect(s.status).toBe("over");
  });
});

describe("safeToSpend", () => {
  it("spreads the remaining flexible money across the days left", () => {
    const r = safeToSpend({
      needsRemaining: 30000,
      wantsRemaining: 30000,
      uncategorizedSpent: 0,
      daysUntilPaycheck: 5,
      daysLeftInMonth: 10,
    });
    expect(r.monthRemaining).toBe(60000);
    expect(r.perDay).toBe(6000);
    expect(r.untilPaycheck).toBe(30000);
  });

  it("subtracts uncategorized spending and never exceeds the month remaining", () => {
    const r = safeToSpend({
      needsRemaining: 10000,
      wantsRemaining: 0,
      uncategorizedSpent: 4000,
      daysUntilPaycheck: 30,
      daysLeftInMonth: 3,
    });
    expect(r.monthRemaining).toBe(6000);
    expect(r.untilPaycheck).toBe(6000);
  });

  it("reports a negative number when already over", () => {
    const r = safeToSpend({ needsRemaining: -5000, wantsRemaining: 1000, uncategorizedSpent: 0, daysUntilPaycheck: 2, daysLeftInMonth: 2 });
    expect(r.monthRemaining).toBe(-4000);
    expect(r.untilPaycheck).toBe(-4000);
  });
});

describe("accounts", () => {
  const accounts = [
    { type: "CHECKING", openingBalance: 100000, inSpendable: true, archived: false, txnSum: -20000 },
    { type: "SAVINGS", openingBalance: 500000, inSpendable: false, archived: false, txnSum: 0 },
    { type: "CREDIT", openingBalance: 0, inSpendable: true, archived: false, txnSum: -30000 },
    { type: "CASH", openingBalance: 5000, inSpendable: true, archived: true, txnSum: 0 },
  ];
  it("counts only spendable, non-archived asset accounts as spendable cash", () => {
    expect(spendableCash(accounts)).toBe(80000);
  });
  it("nets liabilities out of net worth and skips archived accounts", () => {
    expect(netWorth(accounts)).toBe(550000);
  });
});

describe("goalProgress", () => {
  it("reports percentage and monthly amount needed", () => {
    const now = new Date(2026, 8, 18);
    const p = goalProgress({ targetAmount: 120000, saved: 30000, targetDate: new Date(2026, 11, 1) }, now);
    expect(p.pct).toBe(25);
    expect(p.remaining).toBe(90000);
    expect(p.monthsLeft).toBe(3);
    expect(p.monthlyNeeded).toBe(30000);
  });
  it("caps at 100% and needs nothing once complete", () => {
    const p = goalProgress({ targetAmount: 1000, saved: 1500, targetDate: new Date(2030, 0, 1) });
    expect(p.pct).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.monthlyNeeded).toBeNull();
  });
});
