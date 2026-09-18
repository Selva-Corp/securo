import { Suspense } from "react";
import { Upload } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/session";
import { getAccountsWithBalances, getCategories } from "@/server/queries";
import { monthKey, monthRange, parseMonthKey } from "@/lib/dates";
import { BUCKETS, type Bucket } from "@/lib/constants";
import { EmptyState, LinkButton, Money, PageHeader } from "@/components/ui";
import { MonthNav } from "@/components/month-nav";
import { AddTransactionForm } from "./add-transaction-form";
import { FilterBar, type TransactionFilters } from "./filter-bar";
import { TransactionList, type TxnRow } from "./transaction-list";
import type { CategoryOption } from "./category-select";

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const month = monthKey(parseMonthKey(one(sp.month)));
  const filters: TransactionFilters = {
    account: one(sp.account),
    category: one(sp.category),
    bucket: one(sp.bucket),
    q: one(sp.q).trim(),
    unreviewed: one(sp.unreviewed) === "1",
  };

  const { start, end } = monthRange(parseMonthKey(month));
  const where: Prisma.TransactionWhereInput = { userId: user.id, date: { gte: start, lte: end } };
  if (filters.account) where.accountId = filters.account;
  if (filters.category) where.categoryId = filters.category;
  else if (filters.bucket === "NONE") where.categoryId = null;
  else if ((BUCKETS as readonly string[]).includes(filters.bucket)) where.category = { bucket: filters.bucket };
  if (filters.q) where.payee = { contains: filters.q };
  if (filters.unreviewed) where.reviewedAt = null;

  const [transactions, accounts, categories] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: true, account: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    getAccountsWithBalances(user.id, { includeArchived: true }),
    getCategories(user.id, { includeArchived: true }),
  ]);

  const rows: TxnRow[] = transactions.map((t) => ({
    id: t.id,
    date: t.date.toISOString(),
    payee: t.payee,
    memo: t.memo,
    amount: t.amount,
    accountId: t.accountId,
    accountName: t.account.name,
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    bucket: (t.category?.bucket as Bucket | undefined) ?? null,
    reviewed: t.reviewedAt !== null,
    excluded: t.excluded,
    pending: t.pending,
    synced: t.externalId !== null,
  }));

  const inflow = transactions.reduce((s, t) => (t.amount > 0 ? s + t.amount : s), 0);
  const outflow = transactions.reduce((s, t) => (t.amount < 0 ? s + t.amount : s), 0);
  const net = inflow + outflow;

  const accountOptions = accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name }));
  const allAccountOptions = accounts.map((a) => ({ id: a.id, name: a.archived ? `${a.name} (archived)` : a.name }));
  const categoryOptions: CategoryOption[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    bucket: c.bucket as Bucket,
    archived: c.archived,
  }));

  const filtered = Boolean(filters.account || filters.category || filters.bucket || filters.q || filters.unreviewed);

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Everything that moved this month."
        actions={
          <LinkButton href="/transactions/import" variant="secondary">
            <Upload className="h-4 w-4" /> Import CSV
          </LinkButton>
        }
      />
      <div className="mb-4">
        <Suspense>
          <MonthNav month={month} />
        </Suspense>
      </div>

      <AddTransactionForm accounts={accountOptions} categories={categoryOptions} />

      <Suspense>
        <FilterBar accounts={allAccountOptions} categories={categoryOptions} filters={filters} />
      </Suspense>

      <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-3 text-sm">
        <Total label="In" cents={inflow} currency={user.currency} />
        <Total label="Out" cents={outflow} currency={user.currency} />
        <Total label="Net" cents={net} currency={user.currency} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No transactions match these filters" : "No transactions this month"}
          description={filtered ? "Try clearing a filter." : "Add one above or import a CSV from your bank."}
        />
      ) : (
        <TransactionList rows={rows} accounts={accountOptions} categories={categoryOptions} currency={user.currency} />
      )}
    </>
  );
}

function Total({ label, cents, currency }: { label: string; cents: number; currency: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <Money cents={cents} currency={currency} colored signed className="block truncate font-semibold" />
    </div>
  );
}
