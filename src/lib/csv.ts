/**
 * CSV import parsing and mapping. Pure functions only (no node-only imports)
 * so this runs in the browser for previews and in tests.
 */
import Papa from "papaparse";
import { format, isValid, parse } from "date-fns";

export type CsvRecord = Record<string, string>;

export interface ParsedCsv {
  headers: string[];
  records: CsvRecord[];
  errors: string[];
}

/** Parse CSV text with a header row. Blank lines are dropped. */
export function parseCsvText(text: string): ParsedCsv {
  const cleaned = text.replace(/^﻿/, "");
  const result = Papa.parse<CsvRecord>(cleaned, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = (result.meta.fields ?? []).filter((h) => h !== "");
  const errors = result.errors
    .filter((e) => e.code !== "TooFewFields" && e.code !== "TooManyFields")
    .map((e) => (e.row !== undefined ? `Line ${e.row + 2}: ${e.message}` : e.message));
  return { headers, records: result.data, errors };
}

export interface ColumnMapping {
  date: string;
  payee: string;
  memo: string;
  /** Single signed amount column. Used when `debit`/`credit` are empty. */
  amount: string;
  debit: string;
  credit: string;
}

const DATE_NAMES = [/^(posted|transaction|trans|txn)?\s*_?date$/i, /date/i];
const PAYEE_NAMES = [/^(description|payee|name|merchant|narrative|details)$/i, /description|payee|merchant|name/i];
const MEMO_NAMES = [/^(memo|notes?|reference|category)$/i, /memo|note/i];
const AMOUNT_NAMES = [/^amount$/i, /amount|value|total/i];
const DEBIT_NAMES = [/^(debit|withdrawal|withdrawals|money out|outflow|spent|charge)s?(\s*amount)?$/i, /debit|withdraw|outflow/i];
const CREDIT_NAMES = [/^(credit|deposit|deposits|money in|inflow|received)s?(\s*amount)?$/i, /credit|deposit|inflow/i];

function pick(headers: string[], patterns: RegExp[], taken: Set<string>): string {
  for (const p of patterns) {
    const hit = headers.find((h) => !taken.has(h) && p.test(h));
    if (hit) {
      taken.add(hit);
      return hit;
    }
  }
  return "";
}

/** Guess which column holds what based on common bank export header names. */
export function detectColumns(headers: string[]): ColumnMapping {
  const taken = new Set<string>();
  const date = pick(headers, DATE_NAMES, taken);
  const debit = pick(headers, DEBIT_NAMES, taken);
  const credit = pick(headers, CREDIT_NAMES, taken);
  // Only trust a split debit/credit layout when both columns exist.
  if (!debit || !credit) {
    taken.delete(debit);
    taken.delete(credit);
  }
  const amount = debit && credit ? "" : pick(headers, AMOUNT_NAMES, taken);
  const payee = pick(headers, PAYEE_NAMES, taken);
  const memo = pick(headers, MEMO_NAMES, taken);
  return {
    date,
    payee,
    memo,
    amount,
    debit: debit && credit ? debit : "",
    credit: debit && credit ? credit : "",
  };
}

export type DateFormat = "auto" | "ymd" | "mdy" | "dmy";

export const DATE_FORMAT_LABEL: Record<DateFormat, string> = {
  auto: "Auto-detect",
  ymd: "Year-Month-Day (2026-09-03)",
  mdy: "Month/Day/Year (09/03/2026)",
  dmy: "Day/Month/Year (03/09/2026)",
};

const FORMATS: Record<Exclude<DateFormat, "auto">, string[]> = {
  ymd: ["yyyy-MM-dd", "yyyy/MM/dd", "yyyy.MM.dd", "yyyyMMdd"],
  mdy: ["M/d/yyyy", "M-d-yyyy", "M.d.yyyy", "M/d/yy", "M-d-yy"],
  dmy: ["d/M/yyyy", "d-M-yyyy", "d.M.yyyy", "d/M/yy", "d-M-yy"],
};

const TEXT_FORMATS = ["MMM d, yyyy", "MMMM d, yyyy", "d MMM yyyy", "d MMMM yyyy", "MMM d yyyy", "EEE MMM d yyyy"];

function tryFormats(value: string, formats: string[]): Date | null {
  for (const f of formats) {
    const d = parse(value, f, new Date(2000, 0, 1));
    if (isValid(d) && d.getFullYear() >= 1970 && d.getFullYear() <= 2100) return d;
  }
  return null;
}

/**
 * Parse a date cell into "yyyy-MM-dd". Time portions ("2026-09-03T10:00:00Z",
 * "09/03/2026 10:00") are dropped. Returns null when unparseable.
 */
export function parseCsvDate(raw: string, dateFormat: DateFormat = "auto"): string | null {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return null;
  // Strip a trailing time component so plain date formats match.
  const dateOnly = value.replace(/[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm)?\s*(Z|[+-]\d{2}:?\d{2})?$/i, "");

  let d: Date | null = null;
  if (dateFormat === "auto") {
    d =
      tryFormats(dateOnly, FORMATS.ymd) ??
      tryFormats(dateOnly, FORMATS.mdy) ??
      tryFormats(dateOnly, TEXT_FORMATS) ??
      tryFormats(dateOnly, FORMATS.dmy);
  } else {
    d = tryFormats(dateOnly, FORMATS[dateFormat]) ?? tryFormats(dateOnly, TEXT_FORMATS);
  }
  return d ? format(d, "yyyy-MM-dd") : null;
}

/**
 * Parse an amount cell into signed cents. Handles "$1,234.56", "-12.50",
 * "(12.50)" for negatives, a trailing minus ("12.50-"), and "CR"/"DR" suffixes.
 * Returns null for blank or unparseable cells.
 */
export function parseCsvAmount(raw: string): number | null {
  let value = raw.trim();
  if (!value) return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (/-\s*$/.test(value)) {
    negative = !negative;
    value = value.replace(/-\s*$/, "");
  }
  if (/\bDR$/i.test(value)) {
    negative = true;
    value = value.replace(/\s*DR$/i, "");
  } else if (/\bCR$/i.test(value)) {
    value = value.replace(/\s*CR$/i, "");
  }
  value = value.replace(/[^0-9.,\-]/g, "");
  if (value.startsWith("-")) {
    negative = !negative;
    value = value.slice(1);
  }
  // "1.234,56" (comma decimal) vs "1,234.56" (dot decimal).
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma > lastDot && value.length - lastComma - 1 === 2) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else {
    value = value.replace(/,/g, "");
  }
  if (value === "" || value === ".") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const cents = Math.round(num * 100);
  return negative ? -cents : cents;
}

export interface ImportOptions {
  mapping: ColumnMapping;
  dateFormat: DateFormat;
  /** Flip the sign of a single amount column (banks that export spending as positive). */
  invertSign: boolean;
}

export interface ImportRow {
  /** 1-based data line number (header is line 1). */
  line: number;
  date: string; // yyyy-MM-dd
  payee: string;
  memo: string | null;
  amount: number; // signed cents, negative = outflow
}

export interface ImportError {
  line: number;
  message: string;
}

/** Turn parsed records into import rows using the chosen mapping and options. */
export function mapRecords(records: CsvRecord[], options: ImportOptions): { rows: ImportRow[]; errors: ImportError[] } {
  const { mapping, dateFormat, invertSign } = options;
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const splitMode = Boolean(mapping.debit || mapping.credit);

  records.forEach((rec, i) => {
    const line = i + 2;
    const date = parseCsvDate(rec[mapping.date] ?? "", dateFormat);
    if (!date) {
      errors.push({ line, message: `Unreadable date "${rec[mapping.date] ?? ""}"` });
      return;
    }
    const payee = (rec[mapping.payee] ?? "").trim().replace(/\s+/g, " ");
    if (!payee) {
      errors.push({ line, message: "Missing payee" });
      return;
    }
    let amount: number | null;
    if (splitMode) {
      const debit = mapping.debit ? parseCsvAmount(rec[mapping.debit] ?? "") : null;
      const credit = mapping.credit ? parseCsvAmount(rec[mapping.credit] ?? "") : null;
      if (debit === null && credit === null) {
        errors.push({ line, message: "No debit or credit amount" });
        return;
      }
      amount = -Math.abs(debit ?? 0) + Math.abs(credit ?? 0);
    } else {
      amount = parseCsvAmount(rec[mapping.amount] ?? "");
      if (amount === null) {
        errors.push({ line, message: `Unreadable amount "${rec[mapping.amount] ?? ""}"` });
        return;
      }
      if (invertSign) amount = -amount;
    }
    const memoRaw = mapping.memo ? (rec[mapping.memo] ?? "").trim() : "";
    rows.push({ line, date, payee, memo: memoRaw || null, amount });
  });

  return { rows, errors };
}

/** Lowercased, trimmed, digits stripped, whitespace collapsed. Used for dedupe hashes and payee learning. */
export function normalizePayee(payee: string): string {
  return payee
    .toLowerCase()
    .replace(/[0-9]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The string that gets hashed for import dedupe. Hashing happens server-side. */
export function importHashInput(accountId: string, row: { date: string; amount: number; payee: string }): string {
  return `${accountId}|${row.date}|${row.amount}|${normalizePayee(row.payee)}`;
}
