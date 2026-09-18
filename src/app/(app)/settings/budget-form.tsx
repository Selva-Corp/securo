"use client";

import { useActionState, useState } from "react";
import { Calculator } from "lucide-react";
import { updateBudgetSettings } from "@/server/actions/settings";
import { SplitFields, splitFromNumbers, splitOk, type SplitValues } from "@/components/split-fields";
import { ActionNotice, Button, Field, MoneyInput } from "@/components/ui";
import { PAY_FREQUENCY_LABEL, type PayFrequency } from "@/lib/constants";
import { paycheckToMonthly } from "@/lib/budget";
import { centsToInput, formatMoney, parseMoney } from "@/lib/money";

export function BudgetForm({
  monthlyIncome,
  needsPct,
  wantsPct,
  savingsPct,
  paycheckAmount,
  payFrequency,
}: {
  monthlyIncome: number;
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
  paycheckAmount: number;
  payFrequency: PayFrequency;
}) {
  const [state, action, pending] = useActionState(updateBudgetSettings, undefined);
  const [income, setIncome] = useState(centsToInput(monthlyIncome));
  const [split, setSplit] = useState<SplitValues>(splitFromNumbers(needsPct, wantsPct, savingsPct));
  const incomeCents = parseMoney(income) ?? 0;
  const fromPaycheck = paycheckToMonthly(paycheckAmount, payFrequency);

  return (
    <form action={action} className="space-y-5">
      <ActionNotice state={state} />
      <Field label="Monthly take-home income" hint="After taxes and deductions. Your bucket targets are a share of this.">
        <MoneyInput name="monthlyIncome" value={income} onChange={(e) => setIncome(e.target.value)} required />
      </Field>
      {paycheckAmount > 0 ? (
        <button
          type="button"
          onClick={() => setIncome(centsToInput(fromPaycheck))}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <Calculator className="h-4 w-4" aria-hidden />
          Recalculate from paycheck
          <span className="font-normal text-muted">
            ({formatMoney(paycheckAmount)} {PAY_FREQUENCY_LABEL[payFrequency].toLowerCase()} = {formatMoney(fromPaycheck)} / month)
          </span>
        </button>
      ) : (
        <p className="text-xs text-muted">Set a paycheck amount below and you can recalculate this from it.</p>
      )}
      <SplitFields monthlyIncome={incomeCents} value={split} onChange={setSplit} />
      <Button type="submit" disabled={pending || !splitOk(split)}>
        {pending ? "Saving…" : "Save budget"}
      </Button>
    </form>
  );
}
