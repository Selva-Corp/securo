import { describe, expect, it, vi } from "vitest";
import {
  claimAccessUrl,
  decimalToCents,
  decodeSetupToken,
  fetchAccounts,
  institutionName,
  needsReauth,
  normalizeTransaction,
  responseErrors,
  redactAccessUrl,
  SimpleFinError,
  splitAccessUrl,
  windows,
} from "./simplefin";

const claimUrl = "https://beta-bridge.simplefin.org/simplefin/claim/DEMO";
const token = Buffer.from(claimUrl).toString("base64");

describe("decodeSetupToken", () => {
  it("decodes a base64 claim url", () => {
    expect(decodeSetupToken(token)).toBe(claimUrl);
  });
  it("tolerates whitespace and missing padding", () => {
    const stripped = token.replace(/=+$/, "");
    expect(decodeSetupToken(`  ${stripped.slice(0, 10)}\n${stripped.slice(10)}  `)).toBe(claimUrl);
  });
  it("rejects garbage", () => {
    expect(() => decodeSetupToken("hello world")).toThrow(SimpleFinError);
    expect(() => decodeSetupToken("")).toThrow(SimpleFinError);
  });
});

describe("claimAccessUrl", () => {
  it("posts to the claim url and returns the access url", async () => {
    const fetchImpl = vi.fn(async () => new Response("https://user:pass@bridge.example/simplefin", { status: 200 }));
    await expect(claimAccessUrl(claimUrl, fetchImpl)).resolves.toBe("https://user:pass@bridge.example/simplefin");
    expect(fetchImpl).toHaveBeenCalledWith(claimUrl, expect.objectContaining({ method: "POST" }));
  });
  it("explains a reused token", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 }));
    await expect(claimAccessUrl(claimUrl, fetchImpl)).rejects.toMatchObject({ code: "token_used" });
  });
});

describe("splitAccessUrl", () => {
  it("moves credentials into a basic auth header", () => {
    const { baseUrl, authHeader } = splitAccessUrl("https://ab%40c:s%3Acret@bridge.example/simplefin/");
    expect(baseUrl).toBe("https://bridge.example/simplefin");
    expect(authHeader).toBe("Basic " + Buffer.from("ab@c:s:cret").toString("base64"));
  });
  it("redacts for logs", () => {
    expect(redactAccessUrl("https://u:p@bridge.example/simplefin")).toBe("https://bridge.example/simplefin");
  });
});

describe("fetchAccounts", () => {
  it("sends version, pending, and epoch date params with auth", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ errors: [], accounts: [] }), { status: 200 }));
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 1, 1));
    await fetchAccounts("https://u:p@bridge.example/simplefin", { start, end, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const u = new URL(url);
    expect(u.pathname).toBe("/simplefin/accounts");
    expect(u.searchParams.get("version")).toBe("2");
    expect(u.searchParams.get("pending")).toBe("1");
    expect(u.searchParams.get("start-date")).toBe(String(start.getTime() / 1000));
    expect(u.searchParams.get("end-date")).toBe(String(end.getTime() / 1000));
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });
  it("maps 403 to a reauth error", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 }));
    await expect(fetchAccounts("https://u:p@bridge.example/simplefin", { fetchImpl })).rejects.toMatchObject({ code: "reauth" });
  });
});

describe("normalizeTransaction", () => {
  it("converts amounts to cents and epoch to dates", () => {
    const t = normalizeTransaction({ id: "t1", posted: 1_700_000_000, amount: "-12.34", payee: "Coffee", description: "COFFEE SHOP 123" });
    expect(t).toMatchObject({ externalId: "t1", amount: -1234, payee: "Coffee", memo: "COFFEE SHOP 123", pending: false });
    expect(t?.date.toISOString()).toBe("2023-11-14T22:13:20.000Z");
  });
  it("uses now for pending rows with no posted date", () => {
    const now = new Date(2026, 8, 18, 12);
    const t = normalizeTransaction({ id: "p1", posted: 0, amount: "5", pending: true, description: "Hold" }, now);
    expect(t?.date).toEqual(now);
    expect(t?.pending).toBe(true);
    expect(t?.payee).toBe("Hold");
  });
  it("drops rows without an id or date", () => {
    expect(normalizeTransaction({ id: "", posted: 1, amount: "1" })).toBeNull();
    expect(normalizeTransaction({ id: "x", posted: 0, amount: "1" })).toBeNull();
  });
});

describe("helpers", () => {
  it("parses decimals", () => {
    expect(decimalToCents("1,234.56")).toBe(123456);
    expect(decimalToCents("-0.1")).toBe(-10);
    expect(decimalToCents("abc")).toBe(0);
    expect(decimalToCents(undefined)).toBe(0);
  });
  it("splits ranges into 90 day windows", () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 6, 1)); // 181 days
    const w = windows(start, end);
    expect(w).toHaveLength(3);
    expect(w[0].start).toEqual(start);
    expect(w[2].end).toEqual(end);
    expect(windows(start, start)).toHaveLength(0);
  });
});

describe("bridge response shapes", () => {
  const res = {
    accounts: [{ id: "a1", name: "Checking", currency: "USD", balance: "1", "balance-date": 1, conn_id: "C1" }],
    connections: [{ conn_id: "C1", name: "Demo Bank", org_name: "Demo Org" }],
    errlist: [{ code: "con.warn", msg: "slow" }],
    errors: ["plain warning"],
  };
  it("resolves institution names through connections[] and falls back to org", () => {
    expect(institutionName(res.accounts[0], res)).toBe("Demo Bank");
    expect(institutionName({ ...res.accounts[0], conn_id: undefined, org: { name: "Org Bank" } }, res)).toBe("Org Bank");
    expect(institutionName({ ...res.accounts[0], conn_id: undefined })).toBeNull();
  });
  it("collects both error shapes", () => {
    expect(responseErrors(res)).toEqual(["plain warning", "con.warn: slow"]);
  });
  it("detects auth errors", () => {
    expect(needsReauth(res)).toBe(false);
    expect(needsReauth({ accounts: [], errlist: [{ code: "gen.auth", msg: "nope" }] })).toBe(true);
  });
});
