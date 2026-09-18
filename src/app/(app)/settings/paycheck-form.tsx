"use client";

import { useActionState, useState } from "react";
import { CalendarClock } from "lucide-react";
import { updatePaycheckSettings } from "@/server/actions/settings";
import { ActionNotice, Button, Field, Input, Money, MoneyInput, Select } from "@/components/ui";
import { PAY_FREQUENCIES, PAY_FREQUENCY_LABEL, type PayFrequency } from "@/lib/constants";
import { paycheckToMonthly } from "@/lib/budget";
import { daysUntil, formatDate, fromDateInput, nextPayDateOnOrAfter } from "@/lib/dates";
import { centsToInput, parseMoney } from "@/lib/money";

export function PaycheckForm({
  paycheckAmount,
  payFrequency,
  nextPayDate,
  today,
}: {
  paycheckAmount: number;
  payFrequency: PayFrequency;
  /** "yyyy-MM-dd" or null when never set. */
  nextPayDate: string | null;
  /** "yyyy-MM-dd" from the server so both renders agree on "today". */
  today: string;
}) {
  const [state, action, pending] = useActionState(updatePaycheckSettings, undefined);
  const [amount, setAmount] = useState(paycheckAmount > 0 ? centsToInput(paycheckAmount) : "");
  const [frequency, setFrequency] = useState<PayFrequency>(payFrequency);
  const [anchorInput, setAnchorInput] = useState(nextPayDate ?? "");

  const todayDate = fromDateInput(today) ?? new Date();
  const anchor = anchorInput ? fromDateInput(anchorInput) : null;
  const upcoming = anchor ? nextPayDateOnOrAfter(anchor, frequency, todayDate) : null;
  const days = upcoming ? daysUntil(upcoming, todayDate) : null;
  const monthly = paycheckToMonthly(parseMoney(amount) ?? 0, frequency);

  return (
    <form action={action} className="space-y-4">
      <ActionNotice state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Take-home per paycheck">
          <MoneyInput name="paycheckAmount" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Pay frequency">
          <Select name="payFrequency" value={frequency} onChange={(e) => setFrequency(e.target.value as PayFrequency)}>
            {PAY_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {PAY_FREQUENCY_LABEL[f]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="A known pay date" hint="Any past or future payday; Securo works out the rest.">
          <Input type="date" name="nextPayDate" value={anchorInput} onChange={(e) => setAnchorInput(e.target.value)} required />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-border/30 px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted" aria-hidden />
          {upcoming ? (
            <>
              Next paycheck <span className="font-medium">{formatDate(upcoming)}</span>
              <span className="text-muted">{days === 0 ? "· today" : `· in ${days} day${days === 1 ? "" : "s"}`}</span>
            </>
          ) : (
            <span className="text-muted">Pick a pay date to see your next paycheck.</span>
          )}
        </span>
        <span className="text-muted">
          About <Money cents={monthly} className="font-medium text-foreground" /> per month
        </span>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save paycheck"}
      </Button>
    </form>
  );
}
