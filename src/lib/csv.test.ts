import { describe, expect, it } from "vitest";
import {
  detectColumns,
  importHashInput,
  mapRecords,
  normalizePayee,
  parseCsvAmount,
  parseCsvDate,
  parseCsvText,
} from "./csv";

describe("parseCsvText", () => {
  it("parses a header row and trims header names", () => {
    const { headers, records, errors } = parseCsvText("Date , Description,Amount\n2026-09-03,Whole Foods,-12.50\n\n");
    expect(headers).toEqual(["Date", "Description", "Amount"]);
    expect(records).toEqual([{ Date: "2026-09-03", Description: "Whole Foods", Amount: "-12.50" }]);
    expect(errors).toEqual([]);
  });
  it("strips a BOM and handles quoted commas", () => {
    const { records } = parseCsvText('﻿Date,Payee,Amount\n09/03/2026,"Smith, John",5');
    expect(records[0].Payee).toBe("Smith, John");
  });
});

describe("detectColumns", () => {
  it("finds a single signed amount column", () => {
    expect(detectColumns(["Transaction Date", "Description", "Amount", "Memo"])).toEqual({
      date: "Transaction Date",
      payee: "Description",
      memo: "Memo",
      amount: "Amount",
      debit: "",
      credit: "",
    });
  });
  it("prefers debit/credit columns when both exist", () => {
    const m = detectColumns(["Date", "Name", "Debit", "Credit", "Balance"]);
    expect(m.debit).toBe("Debit");
    expect(m.credit).toBe("Credit");
    expect(m.amount).toBe("");
    expect(m.payee).toBe("Name");
  });
  it("does not use a lone debit column as a split layout", () => {
    const m = detectColumns(["Date", "Payee", "Debit"]);
    expect(m.debit).toBe("");
    expect(m.credit).toBe("");
  });
  it("leaves unknown columns blank", () => {
    expect(detectColumns(["foo", "bar"]).date).toBe("");
  });
});

describe("parseCsvDate", () => {
  it("parses ISO dates", () => {
    expect(parseCsvDate("2026-09-03")).toBe("2026-09-03");
    expect(parseCsvDate("2026/09/03")).toBe("2026-09-03");
    expect(parseCsvDate("2026-09-03T14:22:00Z")).toBe("2026-09-03");
  });
  it("parses US dates by default", () => {
    expect(parseCsvDate("09/03/2026")).toBe("2026-09-03");
    expect(parseCsvDate("9/3/26")).toBe("2026-09-03");
    expect(parseCsvDate("09/03/2026 10:15")).toBe("2026-09-03");
  });
  it("parses day-first dates when asked", () => {
    expect(parseCsvDate("03/09/2026", "dmy")).toBe("2026-09-03");
    expect(parseCsvDate("03/09/2026", "mdy")).toBe("2026-03-09");
  });
  it("parses text month dates", () => {
    expect(parseCsvDate("Sep 3, 2026")).toBe("2026-09-03");
    expect(parseCsvDate("September 3, 2026")).toBe("2026-09-03");
    expect(parseCsvDate("3 Sep 2026")).toBe("2026-09-03");
  });
  it("returns null for junk", () => {
    expect(parseCsvDate("")).toBeNull();
    expect(parseCsvDate("not a date")).toBeNull();
    expect(parseCsvDate("13/45/2026", "mdy")).toBeNull();
  });
});

describe("parseCsvAmount", () => {
  it("parses plain and formatted numbers into cents", () => {
    expect(parseCsvAmount("12.5")).toBe(1250);
    expect(parseCsvAmount("$1,234.56")).toBe(123456);
    expect(parseCsvAmount("-$5")).toBe(-500);
    expect(parseCsvAmount("- 3.20")).toBe(-320);
  });
  it("treats parentheses and trailing minus as negative", () => {
    expect(parseCsvAmount("(12.50)")).toBe(-1250);
    expect(parseCsvAmount("($1,000.00)")).toBe(-100000);
    expect(parseCsvAmount("12.50-")).toBe(-1250);
  });
  it("handles DR/CR suffixes and comma decimals", () => {
    expect(parseCsvAmount("12.00 DR")).toBe(-1200);
    expect(parseCsvAmount("12.00 CR")).toBe(1200);
    expect(parseCsvAmount("1.234,56")).toBe(123456);
  });
  it("returns null for blank or junk", () => {
    expect(parseCsvAmount("")).toBeNull();
    expect(parseCsvAmount("n/a")).toBeNull();
  });
});

describe("mapRecords", () => {
  const records = [
    { Date: "09/03/2026", Description: "WHOLE FOODS  1234", Amount: "-42.10", Memo: "" },
    { Date: "09/04/2026", Description: "ACME PAYROLL", Amount: "2,400.00", Memo: "DD" },
    { Date: "bad", Description: "Nothing", Amount: "1", Memo: "" },
    { Date: "09/05/2026", Description: "", Amount: "1", Memo: "" },
    { Date: "09/06/2026", Description: "Mystery", Amount: "", Memo: "" },
  ];
  const mapping = { date: "Date", payee: "Description", memo: "Memo", amount: "Amount", debit: "", credit: "" };

  it("maps a signed amount column and reports row errors", () => {
    const { rows, errors } = mapRecords(records, { mapping, dateFormat: "auto", invertSign: false });
    expect(rows).toEqual([
      { line: 2, date: "2026-09-03", payee: "WHOLE FOODS 1234", memo: null, amount: -4210 },
      { line: 3, date: "2026-09-04", payee: "ACME PAYROLL", memo: "DD", amount: 240000 },
    ]);
    expect(errors.map((e) => e.line)).toEqual([4, 5, 6]);
  });

  it("inverts the sign when asked", () => {
    const { rows } = mapRecords(records.slice(0, 2), { mapping, dateFormat: "mdy", invertSign: true });
    expect(rows.map((r) => r.amount)).toEqual([4210, -240000]);
  });

  it("combines debit and credit columns", () => {
    const split = [
      { Date: "2026-09-01", Name: "Coffee", Debit: "4.50", Credit: "" },
      { Date: "2026-09-02", Name: "Refund", Debit: "", Credit: "10.00" },
      { Date: "2026-09-03", Name: "Weird bank", Debit: "-7.00", Credit: "" },
      { Date: "2026-09-04", Name: "Empty", Debit: "", Credit: "" },
    ];
    const { rows, errors } = mapRecords(split, {
      mapping: { date: "Date", payee: "Name", memo: "", amount: "", debit: "Debit", credit: "Credit" },
      dateFormat: "ymd",
      invertSign: false,
    });
    expect(rows.map((r) => r.amount)).toEqual([-450, 1000, -700]);
    expect(errors).toEqual([{ line: 5, message: "No debit or credit amount" }]);
  });
});

describe("normalizePayee / importHashInput", () => {
  it("normalizes case, digits and whitespace", () => {
    expect(normalizePayee("  WHOLE FOODS #1234 ")).toBe("whole foods #");
    expect(normalizePayee("Netflix.com 09/03")).toBe("netflix.com /");
  });
  it("builds a stable hash input", () => {
    expect(importHashInput("acct1", { date: "2026-09-03", amount: -4210, payee: "Whole Foods 1234" })).toBe(
      "acct1|2026-09-03|-4210|whole foods",
    );
  });
});
