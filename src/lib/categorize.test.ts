import { describe, expect, it } from "vitest";
import { looksLikeTransfer, suggestCategoryId, suggestCategoryName } from "./categorize";

describe("suggestCategoryName", () => {
  it("matches common payees", () => {
    expect(suggestCategoryName("WHOLE FOODS MKT 1234")).toBe("Groceries");
    expect(suggestCategoryName("Netflix.com")).toBe("Subscriptions");
    expect(suggestCategoryName("ACME CORP PAYROLL")).toBe("Paycheck");
    expect(suggestCategoryName("Starbucks #442")).toBe("Dining Out");
    expect(suggestCategoryName("Shell Oil 1234")).toBe("Transportation");
  });
  it("returns null when nothing matches", () => {
    expect(suggestCategoryName("XYZZY 9000")).toBeNull();
    expect(suggestCategoryName("")).toBeNull();
  });
});

describe("suggestCategoryId", () => {
  const cats = [
    { id: "g", name: "groceries" },
    { id: "d", name: "Dining Out", archived: true },
  ];
  it("matches names case-insensitively and skips archived categories", () => {
    expect(suggestCategoryId("Trader Joe's", cats)).toBe("g");
    expect(suggestCategoryId("Chipotle", cats)).toBeNull();
  });
});

describe("looksLikeTransfer", () => {
  it("flags internal transfers but not savings contributions", () => {
    expect(looksLikeTransfer("Online Transfer to Checking")).toBe(true);
    expect(looksLikeTransfer("Transfer to Savings")).toBe(false);
    expect(looksLikeTransfer("Walmart")).toBe(false);
  });
});
