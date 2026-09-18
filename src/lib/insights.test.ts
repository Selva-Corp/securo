import { describe, expect, it } from "vitest";
import { summarizeMonth, type MonthSummary } from "./budget";
import {
  categoryJumpInsights,
  generateInsights,
  largePurchaseInsights,
  paceInsights,
  reviewNudgeInsights,
  savingsRateInsights,
  subscriptionInsights,
  type InsightInput,
  type InsightTxn,
} from "./insights";

const settings = { monthlyIncome: 400000, needsPct: 50, wantsPct: 30, savingsPct: 20 };
const categories = [
  { id: "rent", name: "Rent", bucket: "NEEDS" as const, monthlyLimit: null },
  { id: "food", name: "Dining Out", bucket: "WANTS" as const, monthlyLimit: null },
  { id: "save", name: "Emergency Fund", bucket: "SAVINGS_DEBT" as const, monthlyLimit: null },
  { id: "pay", name: "Paycheck", bucket: "INCOME" as const, monthlyLimit: null },
];
const catById = new Map(categories.map((c) => [c.id, c]));

function txn(amount: number, categoryId: string | null, extra: Partial<InsightTxn> = {}): InsightTxn {
  const cat = categoryId ? catById.get(categoryId) : undefined;
  return {
    amount,
    excluded: false,
    categoryId,
    reviewedAt: new Date(2026, 8, 1),
    bucket: cat?.bucket ?? null,
    categoryName: cat?.name ?? null,
    date: new Date(2026, 8, 10),
    payee: "Payee",
    ...extra,
  };
}

function summary(txns: InsightTxn[]): MonthSummary {
  return summarizeMonth(settings, txns, categories);
}

function input(partial: Partial<InsightInput> & { transactions: InsightTxn[] }): InsightInput {
  return {
    current: summary(partial.transactions),
    previous: null,
    today: new Date(2026, 8, 15), // halfway through a 30-day month
    daysInMonth: 30,
    ...partial,
  };
}

describe("paceInsights", () => {
  it("warns when a bucket is more than 10 points ahead of the month", () => {
    // Wants target 120000; 74400 spent = 62% with 50% of the month gone.
    const i = input({ transactions: [txn(-74400, "food")] });
    const out = paceInsights(i);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ tone: "warn", title: "Wants is ahead of pace", body: "62% used with 50% of the month gone." });
  });

  it("stays quiet within the tolerance", () => {
    const i = input({ transactions: [txn(-66000, "food")] }); // 55%
    expect(paceInsights(i)).toHaveLength(0);
  });

  it("praises a bucket comfortably under pace near month end", () => {
    const i = input({ transactions: [txn(-100000, "rent")], today: new Date(2026, 8, 27) }); // 50% used, 90% gone
    const out = paceInsights(i).filter((x) => x.tone === "good");
    expect(out.map((x) => x.title)).toEqual(["Needs is comfortably under pace"]);
  });

  it("never paces Savings & Debt or praises an untouched bucket", () => {
    const i = input({ transactions: [txn(-80000, "save"), txn(-100000, "rent")], today: new Date(2026, 8, 27) });
    expect(paceInsights(i).map((x) => x.id)).toEqual(["pace-NEEDS"]);
  });

  it("does nothing for past months", () => {
    const i = input({ transactions: [txn(-120000, "food")], isCurrentMonth: false });
    expect(paceInsights(i)).toHaveLength(0);
  });
});

describe("categoryJumpInsights", () => {
  it("flags a category up more than 30% and at least $25", () => {
    const i = input({ transactions: [txn(-20000, "food")], previous: summary([txn(-10000, "food")]) });
    const out = categoryJumpInsights(i);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Dining Out is up 100% on last month");
    expect(out[0].body).toContain("$200.00");
    expect(out[0].body).toContain("$100.00");
  });

  it("ignores small increases and categories with no baseline", () => {
    const small = input({ transactions: [txn(-12000, "food")], previous: summary([txn(-10000, "food")]) });
    expect(categoryJumpInsights(small)).toHaveLength(0);
    const tiny = input({ transactions: [txn(-2000, "food")], previous: summary([txn(-1000, "food")]) });
    expect(categoryJumpInsights(tiny)).toHaveLength(0);
    const fresh = input({ transactions: [txn(-50000, "food")], previous: summary([]) });
    expect(categoryJumpInsights(fresh)).toHaveLength(0);
  });
});

describe("subscriptionInsights", () => {
  it("counts payees charged about the same amount in both months", () => {
    const current = [
      txn(-1599, "food", { payee: "Netflix" }),
      txn(-1099, "food", { payee: "Spotify" }),
      txn(-5000, "food", { payee: "Restaurant" }),
    ];
    const previous = [
      txn(-1599, "food", { payee: "netflix " }),
      txn(-1050, "food", { payee: "Spotify" }), // within 5%
      txn(-9000, "food", { payee: "Restaurant" }), // not close
    ];
    const out = subscriptionInsights(input({ transactions: current, previousTransactions: previous }));
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("2 recurring charges add up to $26.98/month");
    expect(out[0].href).toBe("/transactions");
  });

  it("returns nothing without last month's data", () => {
    expect(subscriptionInsights(input({ transactions: [txn(-1599, "food", { payee: "Netflix" })] }))).toHaveLength(0);
  });
});

describe("largePurchaseInsights", () => {
  it("flags an outflow more than 3x the median and at least $100", () => {
    const txns = [
      txn(-2000, "food", { payee: "Coffee" }),
      txn(-3000, "food", { payee: "Lunch" }),
      txn(-4000, "food", { payee: "Dinner" }),
      txn(-50000, "rent", { payee: "Furniture Store", date: new Date(2026, 8, 11) }),
    ];
    const out = largePurchaseInsights(input({ transactions: txns }));
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("One large purchase this month");
    expect(out[0].body).toContain("$500.00 at Furniture Store on Sep 11");
  });

  it("ignores purchases under $100 even when they dwarf the median", () => {
    const txns = [txn(-500, "food"), txn(-600, "food"), txn(-9000, "food")];
    expect(largePurchaseInsights(input({ transactions: txns }))).toHaveLength(0);
  });
});

describe("savingsRateInsights", () => {
  it("is good when the rate meets the savings target", () => {
    const out = savingsRateInsights(input({ transactions: [txn(400000, "pay"), txn(-90000, "save")] }));
    expect(out[0]).toMatchObject({ tone: "good", title: "You're saving 23% of your income" });
  });
  it("warns when the rate is under half the target", () => {
    const out = savingsRateInsights(input({ transactions: [txn(400000, "pay"), txn(-20000, "save")] }));
    expect(out[0]).toMatchObject({ tone: "warn", title: "Savings rate is 5%, below your 20% target" });
  });
  it("is silent in between and when there is no income yet", () => {
    expect(savingsRateInsights(input({ transactions: [txn(400000, "pay"), txn(-60000, "save")] }))).toHaveLength(0);
    expect(savingsRateInsights(input({ transactions: [txn(-60000, "save")] }))).toHaveLength(0);
  });
});

describe("reviewNudgeInsights", () => {
  it("links to the review queue when something is unreviewed", () => {
    const out = reviewNudgeInsights(input({ transactions: [txn(-1000, null, { reviewedAt: null }), txn(-1000, null, { reviewedAt: null })] }));
    expect(out[0]).toMatchObject({ tone: "info", title: "2 transactions to sort", href: "/review" });
  });
});

describe("generateInsights", () => {
  it("returns at most five, warnings first", () => {
    const current = [
      txn(400000, "pay"),
      txn(-74400, "food", { payee: "Netflix" }), // wants ahead of pace + category jump
      txn(-150000, "rent", { payee: "Landlord" }), // needs ahead of pace, large purchase
      txn(-1000, "save"), // savings rate low
      txn(-1000, null, { reviewedAt: null }),
    ];
    const previous = [txn(-10000, "food", { payee: "Netflix" }), txn(-150000, "rent", { payee: "Landlord" })];
    const out = generateInsights(input({ transactions: current, previous: summary(previous), previousTransactions: previous }));
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out[0].tone).toBe("warn");
    expect(out.map((i) => i.id)).toContain("pace-WANTS");
    expect(out.every((i) => !("priority" in i))).toBe(true);
  });

  it("returns an empty list for an empty month", () => {
    expect(generateInsights(input({ transactions: [] }))).toEqual([]);
  });
});
