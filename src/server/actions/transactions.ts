"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/session";
import { parseMoney } from "@/lib/money";
import { fromDateInput } from "@/lib/dates";

export type TransactionActionState = { ok: true; id?: string } | { ok: false; error: string } | undefined;

function revalidateAll() {
  for (const p of ["/transactions", "/review", "/budget", "/dashboard", "/accounts"]) revalidatePath(p);
}

const dateField = z.string().transform((v, ctx) => {
  const d = fromDateInput(v);
  if (!d) {
    ctx.addIssue({ code: "custom", message: "Enter a valid date" });
    return z.NEVER;
  }
  return d;
});

const amountField = z.string().transform((v, ctx) => {
  const cents = parseMoney(v);
  if (cents === null || cents === 0) {
    ctx.addIssue({ code: "custom", message: "Enter an amount" });
    return z.NEVER;
  }
  return Math.abs(cents);
});

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

const optionalText = z
  .string()
  .max(500, "Keep the memo under 500 characters")
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

const createSchema = z.object({
  date: dateField,
  payee: z.string().trim().min(1, "Who was this paid to?").max(120),
  amount: amountField,
  kind: z.enum(["expense", "income"]).default("expense"),
  accountId: z.string().min(1, "Pick an account"),
  categoryId: optionalId,
  memo: optionalText,
});

export async function createTransaction(_prev: TransactionActionState, formData: FormData): Promise<TransactionActionState> {
  const userId = await requireUserId();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { date, payee, amount, kind, accountId, categoryId, memo } = parsed.data;

  const account = await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
  if (!account) return { ok: false, error: "Account not found" };
  if (categoryId) {
    const category = await prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
    if (!category) return { ok: false, error: "Category not found" };
  }

  const created = await prisma.transaction.create({
    data: {
      userId,
      accountId,
      categoryId,
      date,
      amount: kind === "income" ? amount : -amount,
      payee,
      memo,
      // Categorized manual entries skip the queue; the rest go to review.
      reviewedAt: categoryId ? new Date() : null,
    },
    select: { id: true },
  });
  revalidateAll();
  return { ok: true, id: created.id };
}

const updateSchema = z.object({
  id: z.string().min(1),
  date: dateField.optional(),
  payee: z.string().trim().min(1, "Who was this paid to?").max(120).optional(),
  amount: amountField.optional(),
  kind: z.enum(["expense", "income"]).optional(),
  accountId: z.string().min(1).optional(),
  categoryId: optionalId,
  memo: optionalText,
  excluded: checkbox,
  reviewed: checkbox,
});

/**
 * Edit a transaction. Bank-synced rows (externalId set) only accept
 * category, memo, excluded and reviewed changes; the bank owns the rest.
 */
export async function updateTransaction(_prev: TransactionActionState, formData: FormData): Promise<TransactionActionState> {
  const userId = await requireUserId();
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, date, payee, amount, kind, accountId, categoryId, memo, excluded, reviewed } = parsed.data;

  const txn = await prisma.transaction.findFirst({
    where: { id, userId },
    select: { id: true, externalId: true, amount: true, reviewedAt: true },
  });
  if (!txn) return { ok: false, error: "Transaction not found" };

  if (categoryId) {
    const category = await prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
    if (!category) return { ok: false, error: "Category not found" };
  }

  const data: {
    categoryId: string | null;
    memo: string | null;
    excluded: boolean;
    reviewedAt: Date | null;
    date?: Date;
    payee?: string;
    amount?: number;
    accountId?: string;
  } = {
    categoryId,
    memo,
    excluded,
    reviewedAt: reviewed ? (txn.reviewedAt ?? new Date()) : null,
  };

  if (!txn.externalId) {
    if (date) data.date = date;
    if (payee) data.payee = payee;
    if (amount !== undefined) {
      const sign = kind ? (kind === "income" ? 1 : -1) : txn.amount < 0 ? -1 : 1;
      data.amount = sign * amount;
    }
    if (accountId) {
      const account = await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
      if (!account) return { ok: false, error: "Account not found" };
      data.accountId = accountId;
    }
  }

  await prisma.transaction.update({ where: { id }, data });
  revalidateAll();
  return { ok: true, id };
}

export async function deleteTransaction(id: string): Promise<TransactionActionState> {
  const userId = await requireUserId();
  const txn = await prisma.transaction.findFirst({ where: { id, userId }, select: { id: true } });
  if (!txn) return { ok: false, error: "Transaction not found" };
  await prisma.transaction.delete({ where: { id } });
  revalidateAll();
  return { ok: true };
}
