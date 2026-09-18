import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances } from "@/server/queries";
import { netWorth, spendableCash } from "@/lib/budget";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/constants";
import { Card, CardTitle, Money, PageHeader } from "@/components/ui";
import { BankConnections } from "./bank-connections";
import { AccountItem } from "./account-item";
import { AddAccount } from "./account-form";
import type { AccountView } from "./types";

export const metadata: Metadata = { title: "Accounts" };

const SECTIONS: { title: string; types: AccountType[] }[] = [
  { title: "Cash & bank", types: ["CHECKING", "SAVINGS", "CASH"] },
  { title: "Credit cards", types: ["CREDIT"] },
  { title: "Loans", types: ["LOAN"] },
  { title: "Investments", types: ["INVESTMENT"] },
];

/** "synced 2h ago" style label. */
function syncedLabel(at: Date | null, now: Date): string {
  if (!at) return "not synced yet";
  const mins = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60000));
  if (mins < 1) return "synced just now";
  if (mins < 60) return `synced ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `synced ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `synced ${days}d ago`;
}

export default async function AccountsPage() {
  const user = await requireUser();
  const [accounts, connections, txnCounts] = await Promise.all([
    getAccountsWithBalances(user.id, { includeArchived: true }),
    prisma.bankConnection.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { accounts: true } } },
    }),
    prisma.transaction.groupBy({ by: ["accountId"], where: { userId: user.id }, _count: { _all: true } }),
  ]);

  const now = new Date();
  const countByAccount = new Map(txnCounts.map((t) => [t.accountId, t._count._all]));
  const views: AccountView[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: (ACCOUNT_TYPES as readonly string[]).includes(a.type) ? (a.type as AccountType) : "CHECKING",
    currency: a.currency,
    institution: a.institution,
    balance: a.balance,
    synced: a.connectionId !== null,
    syncedLabel: a.connectionId !== null ? syncedLabel(a.syncedAt, now) : null,
    inSpendable: a.inSpendable,
    archived: a.archived,
    txnCount: countByAccount.get(a.id) ?? 0,
  }));
  const active = views.filter((a) => !a.archived);
  const archived = views.filter((a) => a.archived);

  return (
    <div>
      <PageHeader title="Accounts" description="Everything you own and owe, in one place." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>Spendable cash</CardTitle>
          <div className="mt-2 text-3xl font-semibold tabular">
            <Money cents={spendableCash(accounts)} />
          </div>
          <p className="mt-1 text-xs text-muted">Cash, checking, and savings you have marked as spendable.</p>
        </Card>
        <Card>
          <CardTitle>Net worth</CardTitle>
          <div className="mt-2 text-3xl font-semibold tabular">
            <Money cents={netWorth(accounts)} colored />
          </div>
          <p className="mt-1 text-xs text-muted">All active accounts, minus what you owe.</p>
        </Card>
      </div>

      <div className="space-y-8">
        <BankConnections
          connections={connections.map((c) => ({
            id: c.id,
            displayName: c.displayName,
            status: c.status,
            lastSyncedAt: c.lastSyncedAt,
            lastError: c.lastError,
            accountCount: c._count.accounts,
          }))}
        />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Your accounts</CardTitle>
            <AddAccount />
          </div>
          {active.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
              No accounts yet. Connect a bank or add one by hand to start tracking.
            </p>
          ) : (
            SECTIONS.map((section) => {
              const rows = active.filter((a) => section.types.includes(a.type));
              if (rows.length === 0) return null;
              const subtotal = rows.reduce((s, a) => s + a.balance, 0);
              return (
                <div key={section.title} className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border bg-border/20 px-4 py-2 text-sm">
                    <span className="font-medium">{section.title}</span>
                    <Money cents={subtotal} colored className="text-muted" />
                  </div>
                  <ul className="divide-y divide-border">
                    {rows.map((a) => (
                      <AccountItem key={a.id} account={a} />
                    ))}
                  </ul>
                </div>
              );
            })
          )}
          {archived.length > 0 && (
            <details className="group rounded-xl border border-border bg-card">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted hover:text-foreground">
                Archived ({archived.length})
              </summary>
              <ul className="divide-y divide-border border-t border-border">
                {archived.map((a) => (
                  <AccountItem key={a.id} account={a} />
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
