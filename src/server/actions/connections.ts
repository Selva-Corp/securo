"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/session";
import { SimpleFinError } from "@/lib/simplefin";
import { connectSimpleFin, reconnectSimpleFin, syncAllForUser, syncConnection } from "@/server/sync/simplefin";

export type ConnectionActionState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | undefined;

function describe(err: unknown): string {
  if (err instanceof SimpleFinError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

function revalidateAll() {
  for (const p of ["/accounts", "/transactions", "/review", "/dashboard", "/budget"]) revalidatePath(p);
}

const connectSchema = z.object({
  setupToken: z.string().trim().min(10, "Paste your SimpleFIN setup token"),
  displayName: z.string().trim().max(80).optional(),
});

export async function connectBank(_prev: ConnectionActionState, formData: FormData): Promise<ConnectionActionState> {
  const userId = await requireUserId();
  const parsed = connectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const { result } = await connectSimpleFin(userId, parsed.data.setupToken, parsed.data.displayName);
    revalidateAll();
    return {
      ok: true,
      message: `Connected. Imported ${result.accountsCreated} account${result.accountsCreated === 1 ? "" : "s"} and ${result.transactionsCreated} transactions.`,
    };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

const reconnectSchema = z.object({
  connectionId: z.string().min(1),
  setupToken: z.string().trim().min(10, "Paste a fresh SimpleFIN setup token"),
});

export async function reconnectBank(_prev: ConnectionActionState, formData: FormData): Promise<ConnectionActionState> {
  const userId = await requireUserId();
  const parsed = reconnectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const result = await reconnectSimpleFin(userId, parsed.data.connectionId, parsed.data.setupToken);
    revalidateAll();
    return { ok: true, message: `Reconnected. ${result.transactionsCreated} new transactions.` };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

export async function syncBank(connectionId: string): Promise<ConnectionActionState> {
  const userId = await requireUserId();
  const connection = await prisma.bankConnection.findFirst({ where: { id: connectionId, userId } });
  if (!connection) return { ok: false, error: "Connection not found" };
  try {
    const result = await syncConnection(connectionId);
    revalidateAll();
    return { ok: true, message: `Synced. ${result.transactionsCreated} new, ${result.transactionsUpdated} updated.` };
  } catch (err) {
    revalidateAll();
    return { ok: false, error: describe(err) };
  }
}

export async function syncAllBanks(): Promise<ConnectionActionState> {
  const userId = await requireUserId();
  const results = await syncAllForUser(userId);
  revalidateAll();
  const errors = Object.values(results).filter((r): r is { error: string } => "error" in r);
  if (errors.length) return { ok: false, error: errors[0].error };
  const created = Object.values(results).reduce((s, r) => s + ("transactionsCreated" in r ? r.transactionsCreated : 0), 0);
  return { ok: true, message: `Synced ${Object.keys(results).length} connection(s). ${created} new transactions.` };
}

/**
 * Remove a connection. Linked accounts are kept as manual accounts (their
 * synced balance is frozen into the opening balance) so history is preserved.
 */
export async function disconnectBank(connectionId: string): Promise<ConnectionActionState> {
  const userId = await requireUserId();
  const connection = await prisma.bankConnection.findFirst({
    where: { id: connectionId, userId },
    include: { accounts: { include: { _count: false } } },
  });
  if (!connection) return { ok: false, error: "Connection not found" };

  for (const account of connection.accounts) {
    const sum = await prisma.transaction.aggregate({ where: { accountId: account.id }, _sum: { amount: true } });
    const balance = account.syncedBalance ?? account.openingBalance + (sum._sum.amount ?? 0);
    await prisma.account.update({
      where: { id: account.id },
      data: {
        openingBalance: balance - (sum._sum.amount ?? 0),
        syncedBalance: null,
        syncedAt: null,
        connectionId: null,
        externalId: null,
      },
    });
  }
  await prisma.bankConnection.delete({ where: { id: connectionId } });
  revalidateAll();
  return { ok: true, message: "Bank disconnected. Its accounts are now manual." };
}
