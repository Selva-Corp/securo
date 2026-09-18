import { describe, expect, it } from "vitest";
import { daysLeftInMonth, monthKey, nextPayDateOnOrAfter, parseMonthKey, shiftMonth } from "./dates";

describe("month keys", () => {
  it("round-trips a month key", () => {
    expect(monthKey(parseMonthKey("2026-09"))).toBe("2026-09");
  });
  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("falls back to the current month for junk input", () => {
    expect(monthKey(parseMonthKey("nope"))).toBe(monthKey(new Date()));
  });
});

describe("nextPayDateOnOrAfter", () => {
  const from = new Date(2026, 8, 18); // Sep 18 2026 (Friday)

  it("returns the anchor when it is on the from date", () => {
    expect(nextPayDateOnOrAfter(new Date(2026, 8, 18), "BIWEEKLY", from).getDate()).toBe(18);
  });

  it("walks forward from a past anchor", () => {
    const d = nextPayDateOnOrAfter(new Date(2026, 8, 4), "BIWEEKLY", from);
    expect([d.getMonth(), d.getDate()]).toEqual([8, 18]);
  });

  it("walks backward from a far future anchor", () => {
    const d = nextPayDateOnOrAfter(new Date(2026, 11, 25), "WEEKLY", from);
    expect([d.getMonth(), d.getDate()]).toEqual([8, 18]);
  });

  it("handles monthly pay on the 1st", () => {
    const d = nextPayDateOnOrAfter(new Date(2026, 0, 1), "MONTHLY", from);
    expect([d.getMonth(), d.getDate()]).toEqual([9, 1]);
  });

  it("handles semimonthly pay on the 1st and 15th", () => {
    const d = nextPayDateOnOrAfter(new Date(2026, 0, 1), "SEMIMONTHLY", from);
    expect([d.getMonth(), d.getDate()]).toEqual([9, 1]);
    const d2 = nextPayDateOnOrAfter(new Date(2026, 0, 15), "SEMIMONTHLY", new Date(2026, 8, 2));
    expect([d2.getMonth(), d2.getDate()]).toEqual([8, 15]);
  });
});

describe("daysLeftInMonth", () => {
  it("includes today", () => {
    expect(daysLeftInMonth(new Date(2026, 8, 30))).toBe(1);
    expect(daysLeftInMonth(new Date(2026, 8, 1))).toBe(30);
  });
});
