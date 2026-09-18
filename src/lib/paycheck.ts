/**
 * Paycheck timing view-model. Pure: takes the user's pay settings and a
 * "today" and returns everything the safe-to-spend UI needs.
 */
import { format } from "date-fns";
import { PAY_FREQUENCIES, type PayFrequency } from "./constants";
import { daysLeftInMonth, daysUntil, nextPayDateOnOrAfter } from "./dates";

export interface PaycheckSettings {
  nextPayDate: Date | null;
  payFrequency: string;
}

export interface PaycheckInfo {
  /** Next pay date on or after today, or null when the user has not set one. */
  nextPayDate: Date | null;
  /** Calendar days until that pay date (0 = today). Falls back to days left in the month. */
  daysUntilPaycheck: number;
  /** Days left in the current month, including today (>= 1). */
  daysLeftInMonth: number;
}

function normalizeFrequency(value: string): PayFrequency {
  return (PAY_FREQUENCIES as readonly string[]).includes(value) ? (value as PayFrequency) : "BIWEEKLY";
}

export function paycheckInfo(settings: PaycheckSettings, today = new Date()): PaycheckInfo {
  const left = daysLeftInMonth(today);
  if (!settings.nextPayDate) {
    return { nextPayDate: null, daysUntilPaycheck: left, daysLeftInMonth: left };
  }
  const next = nextPayDateOnOrAfter(settings.nextPayDate, normalizeFrequency(settings.payFrequency), today);
  return { nextPayDate: next, daysUntilPaycheck: daysUntil(next, today), daysLeftInMonth: left };
}

/** "Fri Sep 25, in 7 days" / "Fri Sep 25, tomorrow" / "Fri Sep 25, today" / "end of month, in 12 days". */
export function paydayLabel(info: PaycheckInfo): string {
  const when =
    info.daysUntilPaycheck === 0
      ? "today"
      : info.daysUntilPaycheck === 1
        ? "tomorrow"
        : `in ${info.daysUntilPaycheck} days`;
  if (!info.nextPayDate) return `end of month, ${when}`;
  return `${format(info.nextPayDate, "EEE MMM d")}, ${when}`;
}
