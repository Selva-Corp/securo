"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/session";
import { getCategories } from "@/server/queries";
import { fromDateInput } from "@/lib/dates";
import { importHashInput } from "@/lib/csv";
import { looksLikeTransfer, suggestCategoryId } from "@/lib/categorize";

export type ImportResult =
  | { ok: true; imported: number; skipped: number; total: number }
  | { ok: false; error: string };

/** sha256 of `${accountId}|${yyyy-mm-dd}|${cents}|${normalizedPayee}`. Not exported: "use server" files only export actions. */
function computeImportHash(accountId: string, row: { date: string; amount: number; payee: string }): string {
  return createHash("sha256").update(importHashInput(accountId, row)).digest("hex");
}

const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bad date"),
  payee: z.string().trim().min(1).max(200),
  memo: z.string().max(500).nullable().optional(),
  amount: z.number().int(),
});

const importSchema = z.object({
  accountId: z.string().min(1, "Pick an account"),
  rows: z.array(rowSchema).min(1, "Nothing to import").max(5000, "Import at most 5,000 rows at a time"),
});

export type ImportInput = z.input<typeof importSchema>;

/**
 * Insert parsed CSV rows for an account. Duplicate rows (same account, date,
 * amount and normalized payee, on this or a previous import) are skipped.
 * Rows get a category suggestion and land in the review queue.
 */
export async function importTransactions(input: ImportInput): Promise<ImportResult> {
  const userId = await requireUserId();
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { accountId, rows } = parsed.data;

  const account = await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
  if (!account) return { ok: false, error: "Account not found" };

  const categories = await getCategories(userId);

  // Hash every row, dropping duplicates inside the file itself.
  const seen = new Set<string>();
  const candidates: { hash: string; row: (typeof rows)[number] }[] = [];
  for (const row of rows) {
    const hash = computeImportHash(accountId, row);
    if (seen.has(hash)) continue;
    seen.add(hash);
    candidates.push({ hash, row });
  }

  // Skip rows already imported. SQLite has no createMany skipDuplicates, so we pre-check.
  const existing = new Set<string>();
  const hashes = candidates.map((c) => c.hash);
  for (let i = 0; i < hashes.length; i += 500) {
    const found = await prisma.transaction.findMany({
      where: { userId, importHash: { in: hashes.slice(i, i + 500) } },
      select: { importHash: true },
    });
    for (const f of found) if (f.importHash) existing.add(f.importHash);
  }

  const fresh = candidates.filter((c) => !existing.has(c.hash));
  const data = fresh.flatMap(({ hash, row }) => {
    const date = fromDateInput(row.date);
    if (!date) return [];
    const text = `${row.payee} ${row.memo ?? ""}`;
    return [
      {
        userId,
        accountId,
        date,
        amount: row.amount,
        payee: row.payee,
        memo: row.memo ?? null,
        categoryId: suggestCategoryId(text, categories),
        excluded: looksLikeTransfer(text),
        reviewedAt: null,
        importHash: hash,
      },
    ];
  });

  let imported = 0;
  for (let i = 0; i < data.length; i += 500) {
    const result = await prisma.transaction.createMany({ data: data.slice(i, i + 500) });
    imported += result.count;
  }

  for (const p of ["/transactions", "/review", "/budget", "/dashboard", "/accounts"]) revalidatePath(p);
  return { ok: true, imported, skipped: rows.length - imported, total: rows.length };
}
