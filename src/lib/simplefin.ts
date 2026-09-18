/**
 * SimpleFIN protocol client. Pure functions plus an injectable fetch so it is
 * testable without the network.
 *
 * Flow: the user pastes a Setup Token (base64 of a claim URL). POSTing to the
 * claim URL once returns an Access URL that embeds Basic Auth credentials.
 * GET {accessUrl}/accounts?version=2 then returns accounts with transactions.
 * The bridge limits each request window to 90 days.
 */

export const SIMPLEFIN_BRIDGE_URL = "https://bridge.simplefin.org";
export const SIMPLEFIN_MAX_WINDOW_DAYS = 90;
export const SIMPLEFIN_INITIAL_HISTORY_DAYS = 365;

export class SimpleFinError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_token" | "token_used" | "reauth" | "http" | "parse",
  ) {
    super(message);
    this.name = "SimpleFinError";
  }
}

export interface SimpleFinOrg {
  domain?: string;
  name?: string;
  url?: string;
  "sfin-url"?: string;
  id?: string;
}

export interface SimpleFinTransaction {
  id: string;
  posted: number; // epoch seconds, 0 when pending
  amount: string; // decimal string, negative = outflow
  description?: string;
  payee?: string;
  memo?: string;
  pending?: boolean;
  transacted_at?: number;
}

export interface SimpleFinAccount {
  id: string;
  name: string;
  currency: string;
  balance: string;
  "available-balance"?: string;
  "balance-date": number;
  org?: SimpleFinOrg;
  conn_id?: string; // bridge servers: points into SimpleFinResponse.connections
  transactions?: SimpleFinTransaction[];
}

/** Bridge servers list institutions here, one per linked bank. */
export interface SimpleFinConnection {
  conn_id: string;
  name?: string;
  org_id?: string;
  org_name?: string;
  org_url?: string;
  sfin_url?: string;
}

export interface SimpleFinResponse {
  /** Spec: plain strings. */
  errors?: string[];
  /** Bridge: structured entries. */
  errlist?: { code?: string; msg?: string; message?: string }[];
  accounts: SimpleFinAccount[];
  connections?: SimpleFinConnection[];
}

/** Human-readable error messages from either error shape. */
export function responseErrors(res: SimpleFinResponse): string[] {
  const out: string[] = [];
  for (const e of res.errors ?? []) if (typeof e === "string" && e.trim()) out.push(e.trim());
  for (const e of res.errlist ?? []) {
    const msg = e.msg || e.message;
    if (msg) out.push(e.code ? `${e.code}: ${msg}` : msg);
  }
  return out;
}

/** Errors that mean the stored access URL no longer works. */
export function needsReauth(res: SimpleFinResponse): boolean {
  return (res.errlist ?? []).some((e) => ["gen.auth", "con.auth"].includes((e.code ?? "").toLowerCase()));
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Decode a pasted Setup Token into its claim URL. Tolerates whitespace and lost padding. */
export function decodeSetupToken(raw: string): string {
  const cleaned = raw.replace(/\s+/g, "");
  if (!cleaned) throw new SimpleFinError("Paste your SimpleFIN setup token", "invalid_token");
  const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
  let decoded: string;
  try {
    decoded = Buffer.from(padded, "base64").toString("utf8");
  } catch {
    throw new SimpleFinError("That does not look like a SimpleFIN setup token", "invalid_token");
  }
  if (!/^https?:\/\//.test(decoded)) {
    throw new SimpleFinError("That does not look like a SimpleFIN setup token", "invalid_token");
  }
  return decoded;
}

/** Exchange a claim URL for an Access URL. Single use: the bridge returns 403 on reuse. */
export async function claimAccessUrl(claimUrl: string, fetchImpl: FetchLike = fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(claimUrl, { method: "POST", headers: { "Content-Length": "0" } });
  } catch (err) {
    throw new SimpleFinError(`Could not reach SimpleFIN: ${(err as Error).message}`, "http");
  }
  if (res.status === 403) {
    throw new SimpleFinError("This setup token was already used or has expired. Generate a fresh one.", "token_used");
  }
  if (!res.ok) throw new SimpleFinError(`SimpleFIN claim failed (${res.status})`, "http");
  const accessUrl = (await res.text()).trim().replace(/^"|"$/g, "");
  if (!/^https?:\/\//.test(accessUrl)) throw new SimpleFinError("SimpleFIN did not return an access URL", "parse");
  return accessUrl;
}

/** Split the Basic Auth credentials out of an access URL. */
export function splitAccessUrl(accessUrl: string): { baseUrl: string; authHeader: string | null } {
  const u = new URL(accessUrl);
  const username = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  u.username = "";
  u.password = "";
  const baseUrl = u.toString().replace(/\/$/, "");
  if (!username) return { baseUrl, authHeader: null };
  return { baseUrl, authHeader: "Basic " + Buffer.from(`${username}:${password}`).toString("base64") };
}

export function redactAccessUrl(accessUrl: string): string {
  try {
    const { baseUrl } = splitAccessUrl(accessUrl);
    return baseUrl;
  } catch {
    return "(invalid url)";
  }
}

export interface FetchAccountsOptions {
  start?: Date;
  end?: Date;
  pending?: boolean;
  accountId?: string;
  fetchImpl?: FetchLike;
}

export async function fetchAccounts(accessUrl: string, opts: FetchAccountsOptions = {}): Promise<SimpleFinResponse> {
  const { baseUrl, authHeader } = splitAccessUrl(accessUrl);
  const params = new URLSearchParams({ version: "2" });
  if (opts.pending ?? true) params.set("pending", "1");
  if (opts.start) params.set("start-date", String(Math.floor(opts.start.getTime() / 1000)));
  if (opts.end) params.set("end-date", String(Math.floor(opts.end.getTime() / 1000)));
  if (opts.accountId) params.set("account", opts.accountId);
  const fetchImpl = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/accounts?${params.toString()}`, {
      headers: { Accept: "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
    });
  } catch (err) {
    throw new SimpleFinError(`Could not reach SimpleFIN: ${(err as Error).message}`, "http");
  }
  if (res.status === 401 || res.status === 403) {
    throw new SimpleFinError("SimpleFIN rejected the saved credentials. Reconnect with a new setup token.", "reauth");
  }
  if (!res.ok) throw new SimpleFinError(`SimpleFIN request failed (${res.status})`, "http");
  const body = (await res.json()) as SimpleFinResponse;
  if (!Array.isArray(body.accounts)) throw new SimpleFinError("Unexpected SimpleFIN response", "parse");
  return body;
}

/** Decimal string like "-12.34" to integer cents. */
export function decimalToCents(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function epochToDate(seconds: number | undefined | null): Date | null {
  if (!seconds || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

/** Normalized transaction ready for the database. */
export interface NormalizedTransaction {
  externalId: string;
  date: Date;
  amount: number;
  payee: string;
  memo: string | null;
  pending: boolean;
}

export function normalizeTransaction(raw: SimpleFinTransaction, now = new Date()): NormalizedTransaction | null {
  if (!raw.id) return null;
  const date = epochToDate(raw.posted) ?? epochToDate(raw.transacted_at) ?? (raw.pending ? now : null);
  if (!date) return null;
  const payee = (raw.payee || raw.description || raw.memo || "Transaction").trim().slice(0, 200);
  const memo = raw.memo?.trim() || (raw.payee && raw.description && raw.description !== raw.payee ? raw.description.trim() : null);
  return {
    externalId: raw.id,
    date,
    amount: decimalToCents(raw.amount),
    payee,
    memo: memo ? memo.slice(0, 500) : null,
    pending: Boolean(raw.pending),
  };
}

/** Institution name for an account: bridge connections[] by conn_id first, then the spec's org object. */
export function institutionName(acc: SimpleFinAccount, res?: SimpleFinResponse): string | null {
  if (acc.conn_id && res?.connections) {
    const conn = res.connections.find((c) => c.conn_id === acc.conn_id);
    if (conn) return conn.name || conn.org_name || null;
  }
  return acc.org?.name || acc.org?.domain || null;
}

/** Split a date range into windows the bridge accepts (max 90 days each). */
export function windows(start: Date, end: Date, maxDays = SIMPLEFIN_MAX_WINDOW_DAYS): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  let cursor = new Date(start);
  while (cursor < end) {
    const next = new Date(cursor.getTime() + maxDays * 86400000);
    out.push({ start: new Date(cursor), end: next < end ? next : new Date(end) });
    cursor = next;
  }
  return out;
}
