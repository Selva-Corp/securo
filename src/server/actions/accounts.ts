"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/session";
import { ACCOUNT_TYPES } from "@/lib/constants";
import { parseMoney } from "@/lib/money";

export type AccountActionState = { ok: true; message?: string } | { ok: false; error: string } | undefined;

function revalidate() {
  for (const p of ["/accounts", "/dashboard", "/transactions", "/review", "/budget"]) revalidatePath(p);
}

/** A money text field ("1,234.50") to integer cents. */
const moneyField = z.string().transform((value, ctx) => {
  const cents = parseMoney(value);
  if (cents === null) {
    ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
    return z.NEVER;
  }
  return cents;
});

/** Unchecked checkboxes are absent from FormData; checked ones send "on". */
const checkbox = z.string().optional().transform((v) => v === "on" || v === "true");

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the account a name").max(80, "Keep the name under 80 characters"),
  type: z.enum(ACCOUNT_TYPES, { error: "Pick an account type" }),
  balance: moneyField,
  inSpendable: checkbox,
});

export async function createAccount(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const userId = await requireUserId();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, type, balance, inSpendable } = parsed.data;

  await prisma.account.create({
    data: { userId, name, type, openingBalance: balance, inSpendable },
  });
  revalidate();
  return { ok: true, message: `Added ${name}.` };
}

const updateSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().trim().min(1, "Give the account a name").max(80, "Keep the name under 80 characters"),
  type: z.enum(ACCOUNT_TYPES, { error: "Pick an account type" }),
  balance: z.string().optional(),
  inSpendable: checkbox,
});

/**
 * Edit an account. For manual accounts the entered balance becomes the current
 * balance (the opening balance is shifted so existing transactions still add
 * up). Synced accounts keep their bank-reported balance.
 */
export async function updateAccount(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const userId = await requireUserId();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { accountId, name, type, balance, inSpendable } = parsed.data;

  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) return { ok: false, error: "Account not found" };

  let openingBalance = account.openingBalance;
  if (account.connectionId === null && balance !== undefined && balance.trim() !== "") {
    const cents = parseMoney(balance);
    if (cents === null) return { ok: false, error: "Enter a valid balance" };
    const sum = await prisma.transaction.aggregate({ where: { accountId, userId }, _sum: { amount: true } });
    openingBalance = cents - (sum._sum.amount ?? 0);
  }

  await prisma.account.update({
    where: { id: accountId },
    data: { name, type, inSpendable, openingBalance },
  });
  revalidate();
  return { ok: true, message: "Saved." };
}

export async function archiveAccount(accountId: string, archived: boolean): Promise<AccountActionState> {
  const userId = await requireUserId();
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) return { ok: false, error: "Account not found" };
  await prisma.account.update({ where: { id: accountId }, data: { archived } });
  revalidate();
  return { ok: true, message: archived ? `Archived ${account.name}.` : `Restored ${account.name}.` };
}

/** Delete an account that has no transactions. Accounts with history should be archived instead. */
export async function deleteAccount(accountId: string): Promise<AccountActionState> {
  const userId = await requireUserId();
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    include: { _count: { select: { transactions: true } } },
  });
  if (!account) return { ok: false, error: "Account not found" };
  const count = account._count.transactions;
  if (count > 0) {
    return {
      ok: false,
      error: `${account.name} has ${count} transaction${count === 1 ? "" : "s"}. Archive it instead to keep your history.`,
    };
  }
  await prisma.account.delete({ where: { id: accountId } });
  revalidate();
  return { ok: true, message: `Deleted ${account.name}.` };
}
