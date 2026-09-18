/**
 * Money helpers. Amounts are integer minor units (cents) everywhere in the app.
 */

export function formatMoney(
  cents: number,
  currency = "USD",
  opts: { signed?: boolean; compact?: boolean } = {},
): string {
  const abs = Math.abs(cents) / 100;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: opts.compact && abs >= 1000 ? 0 : 2,
    maximumFractionDigits: opts.compact && abs >= 1000 ? 0 : 2,
  });
  const body = formatter.format(abs);
  if (cents < 0) return `-${body}`;
  if (opts.signed && cents > 0) return `+${body}`;
  return body;
}

/** Parse user input like "1,234.50", "$12", "-3.2" into cents. Returns null if invalid. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Cents to a plain decimal string for form inputs ("12.50"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Integer percent of a cents amount, rounded to the nearest cent. */
export function pctOf(cents: number, pct: number): number {
  return Math.round((cents * pct) / 100);
}

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
