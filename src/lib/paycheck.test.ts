import { describe, expect, it } from "vitest";
import { paycheckInfo, paydayLabel } from "./paycheck";

const today = new Date(2026, 8, 18, 9, 30); // Fri Sep 18 2026

describe("paycheckInfo", () => {
  it("counts days to a future pay date", () => {
    const info = paycheckInfo({ nextPayDate: new Date(2026, 8, 25), payFrequency: "BIWEEKLY" }, today);
    expect(info.nextPayDate?.getDate()).toBe(25);
    expect(info.daysUntilPaycheck).toBe(7);
    expect(info.daysLeftInMonth).toBe(13);
  });

  it("walks a stale anchor forward by the pay frequency", () => {
    const info = paycheckInfo({ nextPayDate: new Date(2026, 7, 28), payFrequency: "BIWEEKLY" }, today);
    // Aug 28 -> Sep 11 -> Sep 25
    expect([info.nextPayDate?.getMonth(), info.nextPayDate?.getDate()]).toEqual([8, 25]);
    expect(info.daysUntilPaycheck).toBe(7);
  });

  it("reports zero days when payday is today", () => {
    const info = paycheckInfo({ nextPayDate: new Date(2026, 8, 18), payFrequency: "WEEKLY" }, today);
    expect(info.daysUntilPaycheck).toBe(0);
  });

  it("falls back to the end of the month when no pay date is set", () => {
    const info = paycheckInfo({ nextPayDate: null, payFrequency: "MONTHLY" }, today);
    expect(info.nextPayDate).toBeNull();
    expect(info.daysUntilPaycheck).toBe(13);
    expect(info.daysLeftInMonth).toBe(13);
  });

  it("treats an unknown frequency as biweekly", () => {
    const info = paycheckInfo({ nextPayDate: new Date(2026, 8, 4), payFrequency: "whenever" }, today);
    expect(info.nextPayDate?.getDate()).toBe(18);
  });
});

describe("paydayLabel", () => {
  it("names the day and the countdown", () => {
    const info = paycheckInfo({ nextPayDate: new Date(2026, 8, 25), payFrequency: "BIWEEKLY" }, today);
    expect(paydayLabel(info)).toBe("Fri Sep 25, in 7 days");
  });
  it("says today and tomorrow", () => {
    expect(paydayLabel({ nextPayDate: new Date(2026, 8, 18), daysUntilPaycheck: 0, daysLeftInMonth: 13 })).toBe("Fri Sep 18, today");
    expect(paydayLabel({ nextPayDate: new Date(2026, 8, 19), daysUntilPaycheck: 1, daysLeftInMonth: 13 })).toBe("Sat Sep 19, tomorrow");
  });
  it("describes the month-end fallback", () => {
    expect(paydayLabel({ nextPayDate: null, daysUntilPaycheck: 13, daysLeftInMonth: 13 })).toBe("end of month, in 13 days");
  });
});
