"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatShortDate, toDateInput } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import type { Bucket } from "@/lib/constants";
import { Badge, BucketBadge, Button, Field, FormError, Input, Money, Select } from "@/components/ui";
import { deleteTransaction, updateTransaction } from "@/server/actions/transactions";
import { CategorySelect, type CategoryOption } from "./category-select";

export interface TxnRow {
  id: string;
  date: string; // ISO
  payee: string;
  memo: string | null;
  amount: number;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  bucket: Bucket | null;
  reviewed: boolean;
  excluded: boolean;
  pending: boolean;
  synced: boolean; // externalId set: the bank owns date/amount/payee/account
}

export function TransactionList({
  rows,
  accounts,
  categories,
  currency,
}: {
  rows: TxnRow[];
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
  currency: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {rows.map((row) => (
        <TransactionItem
          key={row.id}
          row={row}
          accounts={accounts}
          categories={categories}
          currency={currency}
          open={openId === row.id}
          onToggle={() => setOpenId((id) => (id === row.id ? null : row.id))}
        />
      ))}
    </ul>
  );
}

function TransactionItem({
  row,
  accounts,
  categories,
  currency,
  open,
  onToggle,
}: {
  row: TxnRow;
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
  currency: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className={cn(row.excluded && "opacity-70")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-border/30 sm:px-4"
      >
        <div className="w-12 shrink-0 text-xs text-muted">{formatShortDate(new Date(row.date))}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{row.payee}</span>
            {row.pending && <Badge tone="amber">Pending</Badge>}
            {row.excluded && <Badge>Excluded</Badge>}
            {!row.reviewed && <Badge tone="red">Unreviewed</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            {row.categoryName ? (
              <span className="inline-flex items-center gap-1">
                <BucketBadge bucket={row.bucket} />
                <span>{row.categoryName}</span>
              </span>
            ) : (
              <BucketBadge bucket={null} />
            )}
            <span>· {row.accountName}</span>
            {row.memo && <span className="truncate">· {row.memo}</span>}
          </div>
        </div>
        <Money cents={row.amount} currency={currency} colored signed className="shrink-0 text-sm font-semibold" />
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <EditForm row={row} accounts={accounts} categories={categories} onDone={onToggle} />}
    </li>
  );
}

function EditForm({
  row,
  accounts,
  categories,
  onDone,
}: {
  row: TxnRow;
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateTransaction, undefined);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [kind, setKind] = useState<"expense" | "income">(row.amount < 0 ? "expense" : "income");
  const seen = useRef(state);

  useEffect(() => {
    if (state !== seen.current) {
      seen.current = state;
      if (state?.ok) onDone();
    }
  }, [state, onDone]);

  const onDelete = () => {
    if (!window.confirm(`Delete "${row.payee}"? This cannot be undone.`)) return;
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteTransaction(row.id);
      if (result && !result.ok) setDeleteError(result.error);
    });
  };

  return (
    <form action={action} className="border-t border-border bg-background/40 px-3 py-4 sm:px-4">
      <input type="hidden" name="id" value={row.id} />
      <FormError message={state && !state.ok ? state.error : deleteError} />
      {row.synced && (
        <p className="mb-3 inline-flex items-center gap-1 text-xs text-muted">
          <Lock className="h-3 w-3" aria-hidden /> Synced from your bank: date, amount, payee and account are read-only.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Date">
          <Input name="date" type="date" defaultValue={toDateInput(new Date(row.date))} disabled={row.synced} required />
        </Field>
        <Field label="Payee">
          <Input name="payee" defaultValue={row.payee} disabled={row.synced} required maxLength={120} />
        </Field>
        <Field label="Amount">
          <div className="flex gap-2">
            <Select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as "expense" | "income")}
              disabled={row.synced}
              className="w-32"
              aria-label="Type"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
            <Input name="amount" inputMode="decimal" defaultValue={centsToInput(Math.abs(row.amount))} disabled={row.synced} required />
          </div>
        </Field>
        <Field label="Account">
          <Select name="accountId" defaultValue={row.accountId} disabled={row.synced}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            {!accounts.some((a) => a.id === row.accountId) && <option value={row.accountId}>{row.accountName}</option>}
          </Select>
        </Field>
        <Field label="Category">
          <CategorySelect categories={categories} defaultValue={row.categoryId} />
        </Field>
        <Field label="Memo">
          <Input name="memo" defaultValue={row.memo ?? ""} maxLength={500} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="excluded" defaultChecked={row.excluded} className="h-4 w-4 accent-accent" />
          Exclude from budget
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="reviewed" defaultChecked={row.reviewed} className="h-4 w-4 accent-accent" />
          Mark reviewed
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="danger" size="sm" onClick={onDelete} disabled={deleting || pending}>
          {deleting ? "Deleting…" : "Delete"}
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending || deleting}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
