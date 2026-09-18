import { requireUser } from "@/server/session";
import { getCategories, getMonthTransactions } from "@/server/queries";
import { monthLabel } from "@/lib/dates";
import type { Bucket } from "@/lib/constants";
import { PageHeader } from "@/components/ui";
import { CategoryManager, type CategoryRowData } from "./category-manager";

export default async function CategoriesPage() {
  const user = await requireUser();
  const [categories, transactions] = await Promise.all([
    getCategories(user.id, { includeArchived: true }),
    getMonthTransactions(user.id),
  ]);

  const count = new Map<string, number>();
  const spent = new Map<string, number>();
  for (const t of transactions) {
    if (!t.categoryId) continue;
    count.set(t.categoryId, (count.get(t.categoryId) ?? 0) + 1);
    if (t.excluded) continue;
    // Spending buckets report outflows as positive; income reports inflows as positive.
    const signed = t.category?.bucket === "INCOME" ? t.amount : -t.amount;
    spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + signed);
  }

  const rows: CategoryRowData[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    bucket: c.bucket as Bucket,
    icon: c.icon,
    monthlyLimit: c.monthlyLimit,
    archived: c.archived,
    monthCount: count.get(c.id) ?? 0,
    monthSpent: spent.get(c.id) ?? 0,
  }));

  return (
    <>
      <PageHeader
        title="Categories"
        description={`Every category belongs to one bucket. Activity shown for ${monthLabel(new Date())}.`}
      />
      <CategoryManager categories={rows} currency={user.currency} />
    </>
  );
}
