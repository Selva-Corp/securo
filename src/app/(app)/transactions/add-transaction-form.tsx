"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { toDateInput } from "@/lib/dates";
import { Button, Field, FormError, Input } from "@/components/ui";
import { Select } from "@/components/ui";
import { createTransaction } from "@/server/actions/transactions";
import { CategorySelect, type CategoryOption } from "./category-select";

export function AddTransactionForm({
  accounts,
  categories,
}: {
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [state, action, pending] = useActionState(createTransaction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const lastSaved = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state?.ok && state.id && state.id !== lastSaved.current) {
      lastSaved.current = state.id;
      formRef.current?.reset();
      setKind("expense");
      setOpen(false);
    }
  }, [state]);

  if (accounts.length === 0) return null;

  return (
    <div className="mb-4">
      {!open ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add transaction
        </Button>
      ) : (
        <form ref={formRef} action={action} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">New transaction</h2>
            <div className="inline-flex rounded-lg border border-border p-0.5 text-sm" role="radiogroup" aria-label="Type">
              {(["expense", "income"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-md px-3 py-1 font-medium capitalize",
                    kind === k ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          <input type="hidden" name="kind" value={kind} />
          <FormError message={state && !state.ok ? state.error : undefined} />
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Date">
              <Input name="date" type="date" defaultValue={toDateInput(new Date())} required />
            </Field>
            <Field label="Payee">
              <Input name="payee" placeholder="Who was paid?" required maxLength={120} autoFocus />
            </Field>
            <Field label="Amount" hint={kind === "expense" ? "Recorded as money out" : "Recorded as money in"}>
              <Input name="amount" inputMode="decimal" placeholder="0.00" required />
            </Field>
            <Field label="Account">
              <Select name="accountId" defaultValue={accounts[0]?.id} required>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" hint="Leave blank to sort it in Review">
              <CategorySelect categories={categories} />
            </Field>
            <Field label="Memo">
              <Input name="memo" placeholder="Optional" maxLength={500} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
