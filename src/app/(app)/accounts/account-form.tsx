"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createAccount, updateAccount, type AccountActionState } from "@/server/actions/accounts";
import { ActionNotice, Button, Field, Input, Money, MoneyInput, Select } from "@/components/ui";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABEL, LIABILITY_TYPES, type AccountType } from "@/lib/constants";
import { centsToInput } from "@/lib/money";
import type { AccountView } from "./types";

/**
 * Add or edit an account. Synced accounts can change name, type, and the
 * spendable flag only; their balance belongs to the bank.
 */
export function AccountForm({ account, onDone }: { account?: AccountView; onDone?: () => void }) {
  const editing = account !== undefined;
  const [state, action, pending] = useActionState(async (prev: AccountActionState, fd: FormData) => {
    const next = editing ? await updateAccount(prev, fd) : await createAccount(prev, fd);
    if (next?.ok) onDone?.();
    return next;
  }, undefined);

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "CHECKING");
  const [balance, setBalance] = useState(account ? centsToInput(account.balance) : "");
  const [inSpendable, setInSpendable] = useState(account?.inSpendable ?? true);
  const liability = LIABILITY_TYPES.includes(type);

  return (
    <form action={action} className="space-y-4">
      {editing && <input type="hidden" name="accountId" value={account.id} />}
      <ActionNotice state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus />
        </Field>
        <Field label="Type">
          <Select name="type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {account?.synced ? (
        <Field label="Balance" hint={`Reported by ${account.institution ?? "your bank"} and updated on each sync.`}>
          <div className="flex h-10 items-center rounded-lg border border-dashed border-border px-3 text-sm">
            <Money cents={account.balance} colored />
          </div>
        </Field>
      ) : (
        <Field
          label="Current balance"
          hint={
            liability
              ? "Enter what you owe as a negative number, e.g. -420.00."
              : editing
                ? "Changing this adjusts the opening balance so past transactions still add up."
                : "What the account holds right now."
          }
        >
          <MoneyInput name="balance" value={balance} onChange={(e) => setBalance(e.target.value)} required={!editing} />
        </Field>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="inSpendable"
          checked={inSpendable}
          onChange={(e) => setInSpendable(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
        />
        <span>
          <span className="font-medium">Count toward spendable cash</span>
          <span className="block text-xs text-muted">
            {liability ? "Credit cards and loans never count as spendable." : "Turn this off for savings you do not want to touch."}
          </span>
        </span>
      </label>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add account"}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** "Add account" button that reveals the form in place. */
export function AddAccount() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden /> Add account
      </Button>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 font-medium">New manual account</h3>
      <AccountForm onDone={() => setOpen(false)} />
    </div>
  );
}
