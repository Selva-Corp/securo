"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Landmark, PencilLine, Plus, Trash2 } from "lucide-react";
import { completeOnboarding, type OnboardingInput } from "@/server/actions/onboarding";
import { ConnectBankForm } from "@/components/connect-bank";
import { SplitFields, splitFromNumbers, splitOk, splitToNumbers, type SplitValues } from "@/components/split-fields";
import { Button, Field, FormError, FormSuccess, Input, Money, MoneyInput, Select } from "@/components/ui";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  PAY_FREQUENCIES,
  PAY_FREQUENCY_LABEL,
  type AccountType,
  type PayFrequency,
} from "@/lib/constants";
import { paycheckToMonthly } from "@/lib/budget";
import { centsToInput, parseMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

export interface OnboardingDefaults {
  /** "yyyy-MM-dd" computed on the server so server and client render the same value. */
  today: string;
  redo: boolean;
  existingAccounts: number;
  monthlyIncome: number;
  paycheckAmount: number;
  payFrequency: PayFrequency;
  nextPayDate: string;
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
}

const STEPS = [
  { title: "Your income", blurb: "Budgets start with what actually lands in your account." },
  { title: "Your plan", blurb: "Decide how each month's take-home gets divided." },
  { title: "Your accounts", blurb: "Tell Securo where your money lives. You can add more later." },
];

interface ManualAccount {
  key: number;
  name: string;
  type: AccountType;
  balance: string;
}

let nextKey = 1;
const newRow = (): ManualAccount => ({ key: nextKey++, name: "", type: "CHECKING", balance: "" });

export function OnboardingWizard({ defaults }: { defaults: OnboardingDefaults }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Step 1: income
  const [mode, setMode] = useState<"paycheck" | "monthly">(
    defaults.redo && defaults.paycheckAmount === 0 && defaults.monthlyIncome > 0 ? "monthly" : "paycheck",
  );
  const [paycheck, setPaycheck] = useState(defaults.paycheckAmount > 0 ? centsToInput(defaults.paycheckAmount) : "");
  const [frequency, setFrequency] = useState<PayFrequency>(defaults.payFrequency);
  const [nextPayDate, setNextPayDate] = useState(defaults.nextPayDate);
  const [monthly, setMonthly] = useState(defaults.monthlyIncome > 0 ? centsToInput(defaults.monthlyIncome) : "");

  const paycheckCents = parseMoney(paycheck) ?? 0;
  const monthlyIncome = mode === "paycheck" ? paycheckToMonthly(paycheckCents, frequency) : (parseMoney(monthly) ?? 0);

  // Step 2: plan
  const [split, setSplit] = useState<SplitValues>(
    splitFromNumbers(defaults.needsPct, defaults.wantsPct, defaults.savingsPct),
  );

  // Step 3: accounts
  const [accountMode, setAccountMode] = useState<"bank" | "manual" | null>(null);
  const [manual, setManual] = useState<ManualAccount[]>([]);
  const [bankConnected, setBankConnected] = useState(false);

  function validateIncome(): string | null {
    if (mode === "paycheck" && paycheckCents <= 0) return "Enter your take-home pay per paycheck.";
    if (mode === "monthly" && monthlyIncome <= 0) return "Enter your monthly take-home income.";
    if (!nextPayDate) return "Pick your next pay date.";
    return null;
  }

  function goNext() {
    const problem = step === 0 ? validateIncome() : step === 1 && !splitOk(split) ? "Your split needs to add up to 100%." : null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function updateRow(key: number, patch: Partial<ManualAccount>) {
    setManual((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function finish() {
    const accounts: OnboardingInput["accounts"] = [];
    for (const row of manual) {
      const name = row.name.trim();
      const blank = name === "" && row.balance.trim() === "";
      if (blank) continue;
      if (name === "") {
        setError("Give each account a name, or remove the empty row.");
        return;
      }
      const balance = row.balance.trim() === "" ? 0 : parseMoney(row.balance);
      if (balance === null) {
        setError(`Enter a valid balance for ${name}.`);
        return;
      }
      accounts.push({ name, type: row.type, balance, inSpendable: true });
    }
    const pcts = splitToNumbers(split);
    const payload: OnboardingInput = {
      monthlyIncome,
      paycheckAmount: paycheckCents,
      payFrequency: frequency,
      nextPayDate,
      needsPct: pcts.needsPct,
      wantsPct: pcts.wantsPct,
      savingsPct: pcts.savingsPct,
      accounts,
    };
    setError(null);
    startTransition(async () => {
      const result = await completeOnboarding(payload);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div>
      <ol className="mb-6 flex items-center gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < step
                  ? "bg-accent text-accent-foreground"
                  : i === step
                    ? "border-2 border-accent text-accent"
                    : "border border-border text-muted",
              )}
              aria-current={i === step ? "step" : undefined}
            >
              {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn("hidden text-xs font-medium sm:block", i === step ? "text-foreground" : "text-muted")}>
              {s.title}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      <h1 className="text-xl font-semibold tracking-tight">
        {defaults.redo && step === 0 ? "Let's revisit your setup" : STEPS[step].title}
      </h1>
      <p className="mt-1 text-sm text-muted">{STEPS[step].blurb}</p>

      <div className="mt-6">
        <FormError message={error} />
      </div>

      {step === 0 && (
        <div className="mt-4 space-y-4">
          {mode === "paycheck" ? (
            <Field label="Take-home pay per paycheck" hint="After taxes and deductions.">
              <MoneyInput name="paycheckAmount" value={paycheck} onChange={(e) => setPaycheck(e.target.value)} autoFocus />
            </Field>
          ) : (
            <Field label="Monthly take-home income" hint="After taxes and deductions, across all sources.">
              <MoneyInput name="monthlyIncome" value={monthly} onChange={(e) => setMonthly(e.target.value)} autoFocus />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="How often are you paid?">
              <Select name="payFrequency" value={frequency} onChange={(e) => setFrequency(e.target.value as PayFrequency)}>
                {PAY_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {PAY_FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Next pay date">
              <Input type="date" name="nextPayDate" value={nextPayDate} onChange={(e) => setNextPayDate(e.target.value)} required />
            </Field>
          </div>
          {mode === "monthly" && (
            <Field label="Take-home per paycheck (optional)" hint="Lets Securo pace your spending between paychecks.">
              <MoneyInput value={paycheck} onChange={(e) => setPaycheck(e.target.value)} />
            </Field>
          )}
          <div className="rounded-lg bg-border/30 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">Monthly take-home</div>
            <div className="mt-1 text-2xl font-semibold tabular">
              <Money cents={monthlyIncome} />
            </div>
            {mode === "paycheck" && (
              <p className="mt-1 text-xs text-muted">
                <Money cents={paycheckCents} /> {PAY_FREQUENCY_LABEL[frequency].toLowerCase()}, averaged over a year.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "paycheck" ? "monthly" : "paycheck"));
              setError(null);
            }}
            className="text-sm font-medium text-accent hover:underline"
          >
            {mode === "paycheck" ? "I'd rather enter a monthly amount" : "I'd rather enter it per paycheck"}
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted">
            The 50/30/20 rule sends half of your <Money cents={monthlyIncome} className="font-medium text-foreground" /> to
            needs, 30% to wants, and 20% to savings and debt. Adjust it to fit your life.
          </p>
          <SplitFields monthlyIncome={monthlyIncome} value={split} onChange={setSplit} />
        </div>
      )}

      {step === 2 && (
        <div className="mt-4 space-y-4">
          {defaults.existingAccounts > 0 && (
            <p className="text-sm text-muted">
              You already have {defaults.existingAccounts} account{defaults.existingAccounts === 1 ? "" : "s"}. Anything you
              add here is added alongside them.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              active={accountMode === "bank"}
              onClick={() => setAccountMode("bank")}
              icon={<Landmark className="h-5 w-5" aria-hidden />}
              title="Connect a bank"
              blurb="Import accounts and transactions automatically through SimpleFIN."
            />
            <ChoiceCard
              active={accountMode === "manual"}
              onClick={() => {
                setAccountMode("manual");
                setManual((rows) => (rows.length ? rows : [newRow()]));
              }}
              icon={<PencilLine className="h-5 w-5" aria-hidden />}
              title="Add accounts manually"
              blurb="Type in a few balances now and record transactions yourself."
            />
          </div>

          {accountMode === "bank" && (
            <div className="rounded-xl border border-border p-4">
              {bankConnected ? (
                <FormSuccess message="Bank connected. Its accounts and recent transactions are imported and will be waiting on your Accounts page." />
              ) : (
                <ConnectBankForm onDone={() => setBankConnected(true)} />
              )}
            </div>
          )}

          {accountMode === "manual" && (
            <div className="space-y-3 rounded-xl border border-border p-4">
              {manual.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center sm:border-0 sm:p-0"
                >
                  <Input
                    aria-label="Account name"
                    placeholder="Account name"
                    value={row.name}
                    onChange={(e) => updateRow(row.key, { name: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Remove account"
                    className="sm:order-last"
                    onClick={() => setManual((rows) => rows.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                  <Select
                    aria-label="Account type"
                    className="col-span-2 sm:col-span-1"
                    value={row.type}
                    onChange={(e) => updateRow(row.key, { type: e.target.value as AccountType })}
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACCOUNT_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </Select>
                  <MoneyInput
                    aria-label="Current balance"
                    containerClassName="col-span-2 sm:col-span-1"
                    value={row.balance}
                    onChange={(e) => updateRow(row.key, { balance: e.target.value })}
                  />
                </div>
              ))}
              <p className="text-xs text-muted">
                Enter what each account holds today. Owe money on a card or loan? Enter it as a negative balance.
              </p>
              <Button variant="secondary" size="sm" onClick={() => setManual((rows) => [...rows, newRow()])}>
                <Plus className="h-4 w-4" aria-hidden /> Add another
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
        {step > 0 ? (
          <Button variant="ghost" onClick={goBack} disabled={pending}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={goNext}>
            Continue <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {accountMode !== null && manual.length === 0 && !bankConnected && (
              <span className="hidden text-xs text-muted sm:inline">You can always add accounts later.</span>
            )}
            <Button onClick={finish} disabled={pending}>
              {pending ? "Saving…" : accountMode === null && !bankConnected ? "Skip and finish" : "Finish setup"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChoiceCard({
  active,
  onClick,
  icon,
  title,
  blurb,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  blurb: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
        active ? "border-accent bg-accent/10" : "border-border hover:bg-border/30",
      )}
    >
      <span className={cn("mt-0.5", active ? "text-accent" : "text-muted")}>{icon}</span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{blurb}</span>
      </span>
    </button>
  );
}
