"use client";

import { useActionState, useState } from "react";
import { addContribution } from "@/server/actions/goals";
import { ActionNotice, Button, Field, Input, MoneyInput } from "@/components/ui";

export function ContributionForm({ goalId, today, isDebt }: { goalId: string; today: string; isDebt: boolean }) {
  const [state, action, pending] = useActionState(addContribution, undefined);
  const [withdraw, setWithdraw] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="goalId" value={goalId} />
      <ActionNotice state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <MoneyInput name="amount" required autoComplete="off" />
        </Field>
        <Field label="Date">
          <Input name="date" type="date" defaultValue={today} required />
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Input name="note" placeholder="Monthly transfer" maxLength={200} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="withdraw"
          checked={withdraw}
          onChange={(e) => setWithdraw(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-accent"
        />
        {isDebt ? "This is a new charge (increases what is owed)" : "This is a withdrawal"}
      </label>
      <Button type="submit" disabled={pending} variant={withdraw ? "secondary" : "primary"}>
        {pending ? "Saving…" : withdraw ? (isDebt ? "Record charge" : "Record withdrawal") : isDebt ? "Record payment" : "Add contribution"}
      </Button>
    </form>
  );
}
