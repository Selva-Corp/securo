import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isValid,
  parse,
  parseISO,
  setDate,
  startOfMonth,
} from "date-fns";
import type { PayFrequency } from "./constants";

/** "2026-09" for a date. */
export function monthKey(date: Date): string {
  return format(date, "yyyy-MM");
}

/** Parse "2026-09" into the first day of that month. Falls back to the current month. */
export function parseMonthKey(key: string | undefined | null): Date {
  if (key) {
    const parsed = parse(key, "yyyy-MM", new Date());
    if (isValid(parsed)) return startOfMonth(parsed);
  }
  return startOfMonth(new Date());
}

export function monthRange(month: Date): { start: Date; end: Date } {
  return { start: startOfMonth(month), end: endOfMonth(month) };
}

export function monthLabel(month: Date): string {
  return format(month, "MMMM yyyy");
}

export function shiftMonth(key: string, delta: number): string {
  return monthKey(addMonths(parseMonthKey(key), delta));
}

/** "2026-09-18" for form inputs. */
export function toDateInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Parse a "yyyy-MM-dd" input as a local date at noon (avoids DST edge cases). */
export function fromDateInput(value: string): Date | null {
  const d = parseISO(value);
  if (!isValid(d)) return null;
  d.setHours(12, 0, 0, 0);
  return d;
}

export function formatDate(date: Date): string {
  return format(date, "MMM d, yyyy");
}

export function formatShortDate(date: Date): string {
  return format(date, "MMM d");
}

/**
 * Given a known pay date and a frequency, return the first pay date on or after `from`.
 * Semimonthly pays twice a month: the anchor day and the day 15 days apart from it,
 * with the second date capped at the last day of the month (so the 15th pairs with
 * month end, and the 1st pairs with the 15th).
 */
export function nextPayDateOnOrAfter(anchor: Date, frequency: PayFrequency, from: Date): Date {
  const fromNoon = new Date(from);
  fromNoon.setHours(12, 0, 0, 0);

  if (frequency === "SEMIMONTHLY") {
    const day = anchor.getDate();
    const lo = day <= 15 ? day : day - 15;
    let cursor = startOfMonth(addMonths(fromNoon, -1));
    for (let i = 0; i < 48; i++) {
      const last = endOfMonth(cursor).getDate();
      const hi = lo === 15 ? last : Math.min(lo + 14, last);
      for (const d of [lo, hi]) {
        const candidate = setDate(cursor, d);
        candidate.setHours(12, 0, 0, 0);
        if (candidate >= fromNoon) return candidate;
      }
      cursor = addMonths(cursor, 1);
    }
    return fromNoon;
  }

  let candidate = new Date(anchor);
  candidate.setHours(12, 0, 0, 0);
  const step = (d: Date, dir: 1 | -1): Date => {
    switch (frequency) {
      case "WEEKLY":
        return addWeeks(d, dir);
      case "BIWEEKLY":
        return addWeeks(d, 2 * dir);
      default:
        return addMonths(d, dir);
    }
  };
  let guard = 0;
  while (candidate > fromNoon && guard++ < 2000) candidate = step(candidate, -1);
  guard = 0;
  while (candidate < fromNoon && guard++ < 2000) candidate = step(candidate, 1);
  return candidate;
}

export function daysUntil(date: Date, from = new Date()): number {
  return Math.max(0, differenceInCalendarDays(date, from));
}

export function daysLeftInMonth(from = new Date()): number {
  return Math.max(1, differenceInCalendarDays(endOfMonth(from), from) + 1);
}

export { addDays };
