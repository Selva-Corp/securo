/**
 * SimpleFIN sync service: connects a bridge token to a user and pulls accounts
 * and transactions into the database.
 */
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { looksLikeTransfer, suggestCategoryId } from "@/lib/categorize";
import {
  claimAccessUrl,
  decimalToCents,
  decodeSetupToken,
  epochToDate,
  fetchAccounts,
  institutionName,
  needsReauth,
  normalizeTransaction,
  responseErrors,
  SIMPLEFIN_INITIAL_HISTORY_DAYS,
  SimpleFinError,
  windows,
  type SimpleFinAccount,
  type SimpleFinResponse,
} from "@/lib/simplefin";

export interface SyncResult {
  accountsCreated: number;
  accountsUpdated: number;
  transactionsCreated: number;
  transactionsUpdated: number;
  warnings: string[];
}

/** Claim a setup token, store the connection, and run the first sync. */
export async function connectSimpleFin(userId: string, setupToken: string, displayName?: string) {
  const claimUrl = decodeSetupToken(setupToken);
  const accessUrl = await claimAccessUrl(claimUrl);

  // Fetch once without transactions to name the connection and validate the URL.
  const probe = await fetchAccounts(accessUrl, { pending: false, start: new Date(), end: new Date() });
  const firstInstitution = probe.accounts.map((a) => institutionName(a, probe)).find(Boolean) ?? null;

  const connection = await prisma.bankConnection.create({
    data: {
      userId,
      provider: "SIMPLEFIN",
      displayName: displayName?.trim() || firstInstitution || "SimpleFIN",
      accessUrlEnc: encrypt(accessUrl),
      status: "ACTIVE",
    },
  });

  const result = await syncConnection(connection.id, { initial: true });
  return { connection, result };
}

/** Replace the access URL on an existing connection (after the bridge revoked it). */
export async function reconnectSimpleFin(userId: string, connectionId: string, setupToken: string) {
  const connection = await prisma.bankConnection.findFirst({ where: { id: connectionId, userId } });
  if (!connection) throw new SimpleFinError("Connection not found", "http");
  const accessUrl = await claimAccessUrl(decodeSetupToken(setupToken));
  await prisma.bankConnection.update({
    where: { id: connectionId },
    data: { accessUrlEnc: encrypt(accessUrl), status: "ACTIVE", lastError: null },
  });
  return syncConnection(connectionId);
}

/** Sync every active connection for a user. Errors are recorded per connection, not thrown. */
export async function syncAllForUser(userId: string): Promise<Record<string, SyncResult | { error: string }>> {
  const connections = await prisma.bankConnection.findMany({ where: { userId, status: { not: "NEEDS_RECONNECT" } } });
  const out: Record<string, SyncResult | { error: string }> = {};
  for (const c of connections) {
    try {
      out[c.id] = await syncConnection(c.id);
    } catch (err) {
      out[c.id] = { error: (err as Error).message };
    }
  }
  return out;
}

/**
 * Pull accounts and transactions for one connection.
 * - New provider accounts become Account rows (type defaults to CHECKING; the user can edit).
 * - Transactions upsert by (accountId, externalId). New ones land in the review queue with a
 *   suggested category. Existing ones keep the user's category and review state.
 * - Balances come from the provider and are stored on Account.syncedBalance.
 */
export async function syncConnection(connectionId: string, opts: { initial?: boolean } = {}): Promise<SyncResult> {
  const connection = await prisma.bankConnection.findUnique({ where: { id: connectionId } });
  if (!connection) throw new Error("Connection not found");
  const accessUrl = decrypt(connection.accessUrlEnc);
  const now = new Date();

  const result: SyncResult = {
    accountsCreated: 0,
    accountsUpdated: 0,
    transactionsCreated: 0,
    transactionsUpdated: 0,
    warnings: [],
  };

  try {
    // How far back to look: a year on first sync, otherwise 30 days before the last sync
    // (pending transactions can post late) with a floor of 30 days.
    const lookbackDays = opts.initial || !connection.lastSyncedAt ? SIMPLEFIN_INITIAL_HISTORY_DAYS : 30;
    const start = new Date(now.getTime() - lookbackDays * 86400000);
    const end = new Date(now.getTime() + 86400000);

    const categories = await prisma.category.findMany({ where: { userId: connection.userId } });
    const accountIdByExternal = new Map<string, string>();

    for (const w of windows(start, end)) {
      const payload = await fetchAccounts(accessUrl, { start: w.start, end: w.end, pending: true });
      if (needsReauth(payload)) {
        throw new SimpleFinError("SimpleFIN says this connection needs to be re-authorized at the bridge.", "reauth");
      }
      for (const msg of responseErrors(payload)) if (!result.warnings.includes(msg)) result.warnings.push(msg);

      for (const raw of payload.accounts) {
        const accountId = await upsertAccount(connection.id, connection.userId, raw, payload, accountIdByExternal, result);
        for (const rawTxn of raw.transactions ?? []) {
          const t = normalizeTransaction(rawTxn, now);
          if (!t) continue;
          const text = `${t.payee} ${t.memo ?? ""}`;
          const existing = await prisma.transaction.findUnique({
            where: { accountId_externalId: { accountId, externalId: t.externalId } },
            select: { id: true, pending: true },
          });
          if (existing) {
            // Only refresh provider-owned fields; never touch category or review state.
            await prisma.transaction.update({
              where: { id: existing.id },
              data: { date: t.date, amount: t.amount, pending: t.pending },
            });
            result.transactionsUpdated++;
            continue;
          }

          // Some banks re-issue a pending transaction under a new id once it posts.
          // Adopt the pending row instead of creating a duplicate.
          if (!t.pending) {
            const posted = await prisma.transaction.findFirst({
              where: {
                accountId,
                pending: true,
                amount: t.amount,
                payee: t.payee,
                date: { gte: new Date(t.date.getTime() - 5 * 86400000), lte: new Date(t.date.getTime() + 5 * 86400000) },
              },
              select: { id: true },
            });
            if (posted) {
              await prisma.transaction.update({
                where: { id: posted.id },
                data: { externalId: t.externalId, date: t.date, pending: false },
              });
              result.transactionsUpdated++;
              continue;
            }
          }
          {
            await prisma.transaction.create({
              data: {
                userId: connection.userId,
                accountId,
                externalId: t.externalId,
                date: t.date,
                amount: t.amount,
                payee: t.payee,
                memo: t.memo,
                pending: t.pending,
                categoryId: suggestCategoryId(text, categories),
                excluded: looksLikeTransfer(text),
                reviewedAt: null,
              },
            });
            result.transactionsCreated++;
          }
        }
      }
    }

    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: now, lastError: null, status: "ACTIVE" },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const needsReconnect = err instanceof SimpleFinError && err.code === "reauth";
    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: { lastError: message, status: needsReconnect ? "NEEDS_RECONNECT" : "ERROR" },
    });
    throw err;
  }
}

async function upsertAccount(
  connectionId: string,
  userId: string,
  raw: SimpleFinAccount,
  payload: SimpleFinResponse,
  cache: Map<string, string>,
  result: SyncResult,
): Promise<string> {
  const cached = cache.get(raw.id);
  const balance = decimalToCents(raw.balance);
  const syncedAt = epochToDate(raw["balance-date"]) ?? new Date();
  const currency = /^[A-Za-z]{3}$/.test(raw.currency ?? "") ? raw.currency.toUpperCase() : "USD";
  const institution = institutionName(raw, payload);

  if (cached) {
    await prisma.account.update({ where: { id: cached }, data: { syncedBalance: balance, syncedAt } });
    return cached;
  }

  const existing = await prisma.account.findUnique({
    where: { connectionId_externalId: { connectionId, externalId: raw.id } },
    select: { id: true },
  });
  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data: { syncedBalance: balance, syncedAt, currency, institution },
    });
    cache.set(raw.id, existing.id);
    result.accountsUpdated++;
    return existing.id;
  }

  const created = await prisma.account.create({
    data: {
      userId,
      connectionId,
      externalId: raw.id,
      name: raw.name || "Account",
      type: guessAccountType(raw.name, balance),
      currency,
      institution,
      openingBalance: 0,
      syncedBalance: balance,
      syncedAt,
    },
    select: { id: true },
  });
  cache.set(raw.id, created.id);
  result.accountsCreated++;
  return created.id;
}

/** SimpleFIN does not expose an account type, so infer one from the name and balance sign. */
export function guessAccountType(name: string, balance: number): string {
  const n = name.toLowerCase();
  if (/credit|visa|mastercard|amex|card/.test(n)) return "CREDIT";
  if (/loan|mortgage/.test(n)) return "LOAN";
  if (/saving|money market|hysa/.test(n)) return "SAVINGS";
  if (/invest|brokerage|401k|ira|roth/.test(n)) return "INVESTMENT";
  if (/cash/.test(n)) return "CASH";
  if (balance < 0) return "CREDIT";
  return "CHECKING";
}
