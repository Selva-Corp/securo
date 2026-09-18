"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/session";
import { normalizePayee } from "@/lib/csv";

export type ReviewActionResult = { ok: true } | { ok: false; error: string };

function revalidateAll() {
  for (const p of ["/review", "/transactions", "/budget", "/dashboard"]) revalidatePath(p);
}

const reviewSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1).nullable(),
  excluded: z.boolean().default(false),
});

/**
 * Confirm a transaction's bucket/category and take it out of the queue.
 * When a category is chosen, other unreviewed transactions from the same payee
 * pick it up as a suggestion (they stay in the queue).
 */
export async function reviewTransaction(input: z.input<typeof reviewSchema>): Promise<ReviewActionResult> {
  const userId = await requireUserId();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, categoryId, excluded } = parsed.data;

  const txn = await prisma.transaction.findFirst({ where: { id, userId }, select: { id: true, payee: true } });
  if (!txn) return { ok: false, error: "Transaction not found" };

  if (categoryId) {
    const category = await prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
    if (!category) return { ok: false, error: "Category not found" };
  }

  await prisma.transaction.update({
    where: { id },
    data: { categoryId, excluded, reviewedAt: new Date() },
  });

  if (categoryId) {
    const key = normalizePayee(txn.payee);
    if (key) {
      const candidates = await prisma.transaction.findMany({
        where: { userId, reviewedAt: null, id: { not: id } },
        select: { id: true, payee: true },
      });
      const ids = candidates.filter((c) => normalizePayee(c.payee) === key).map((c) => c.id);
      if (ids.length > 0) {
        await prisma.transaction.updateMany({ where: { id: { in: ids }, userId }, data: { categoryId } });
      }
    }
  }

  revalidateAll();
  return { ok: true };
}

const unreviewSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1).nullable(),
  excluded: z.boolean().default(false),
});

/** Undo a review: put the transaction back in the queue with its previous category/excluded state. */
export async function unreviewTransaction(input: z.input<typeof unreviewSchema>): Promise<ReviewActionResult> {
  const userId = await requireUserId();
  const parsed = unreviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, categoryId, excluded } = parsed.data;

  const txn = await prisma.transaction.findFirst({ where: { id, userId }, select: { id: true } });
  if (!txn) return { ok: false, error: "Transaction not found" };

  if (categoryId) {
    const category = await prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
    if (!category) return { ok: false, error: "Category not found" };
  }

  await prisma.transaction.update({
    where: { id },
    data: { categoryId, excluded, reviewedAt: null },
  });

  revalidateAll();
  return { ok: true };
}
