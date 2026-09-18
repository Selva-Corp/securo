"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/session";
import { BUCKETS } from "@/lib/constants";
import { parseMoney } from "@/lib/money";
import { CATEGORY_ICON_NAMES } from "@/components/category-icon";

export type CategoryActionState = { ok: true; id?: string } | { ok: false; error: string } | undefined;

function revalidateAll() {
  for (const p of ["/categories", "/review", "/transactions", "/budget", "/dashboard"]) revalidatePath(p);
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

const limitSchema = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const raw = (v ?? "").trim();
    if (!raw) return null;
    const cents = parseMoney(raw);
    if (cents === null || cents < 0) {
      ctx.addIssue({ code: "custom", message: "Enter a valid monthly limit" });
      return z.NEVER;
    }
    return cents === 0 ? null : cents;
  });

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the category a name").max(60, "Keep the name under 60 characters"),
  bucket: z.enum(BUCKETS, { message: "Pick a bucket" }),
  icon: z
    .string()
    .optional()
    .transform((v) => (v && CATEGORY_ICON_NAMES.includes(v) ? v : "tag")),
  monthlyLimit: limitSchema,
});

export type CreateCategoryInput = {
  name: string;
  bucket: string;
  icon?: string;
  monthlyLimit?: string;
};

/** Create a category and return its id. Used by the categories page and the review deck. */
export async function createCategory(input: CreateCategoryInput): Promise<CategoryActionState> {
  const userId = await requireUserId();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, bucket, icon, monthlyLimit } = parsed.data;
  try {
    const last = await prisma.category.findFirst({
      where: { userId, bucket },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const created = await prisma.category.create({
      data: { userId, name, bucket, icon, monthlyLimit, sortOrder: (last?.sortOrder ?? 0) + 1 },
      select: { id: true },
    });
    revalidateAll();
    return { ok: true, id: created.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: `You already have a category named "${name}"` };
    throw err;
  }
}

/** Form-action variant of createCategory for useActionState. */
export async function createCategoryForm(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  return createCategory({
    name: String(formData.get("name") ?? ""),
    bucket: String(formData.get("bucket") ?? ""),
    icon: String(formData.get("icon") ?? ""),
    monthlyLimit: String(formData.get("monthlyLimit") ?? ""),
  });
}

const updateSchema = createSchema.extend({ id: z.string().min(1) });

export async function updateCategory(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const userId = await requireUserId();
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    bucket: formData.get("bucket"),
    icon: formData.get("icon") ?? undefined,
    monthlyLimit: formData.get("monthlyLimit") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, name, bucket, icon, monthlyLimit } = parsed.data;
  const existing = await prisma.category.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return { ok: false, error: "Category not found" };
  try {
    await prisma.category.update({ where: { id }, data: { name, bucket, icon, monthlyLimit } });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: `You already have a category named "${name}"` };
    throw err;
  }
  revalidateAll();
  return { ok: true, id };
}

export async function archiveCategory(id: string, archived: boolean): Promise<CategoryActionState> {
  const userId = await requireUserId();
  const existing = await prisma.category.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return { ok: false, error: "Category not found" };
  await prisma.category.update({ where: { id }, data: { archived } });
  revalidateAll();
  return { ok: true, id };
}

/** Delete a category only when nothing references it; otherwise ask the caller to archive. */
export async function deleteCategory(id: string): Promise<CategoryActionState> {
  const userId = await requireUserId();
  const existing = await prisma.category.findFirst({
    where: { id, userId },
    select: { id: true, _count: { select: { transactions: true } } },
  });
  if (!existing) return { ok: false, error: "Category not found" };
  const n = existing._count.transactions;
  if (n > 0) {
    return {
      ok: false,
      error: `This category is used by ${n} transaction${n === 1 ? "" : "s"}. Archive it instead to keep history intact.`,
    };
  }
  await prisma.category.delete({ where: { id } });
  revalidateAll();
  return { ok: true };
}
