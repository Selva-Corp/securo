"use client";

import { bucketTargets, splitIsValid } from "@/lib/budget";
import { BUCKET_COLOR, BUCKET_DESCRIPTION, BUCKET_LABEL, SPENDING_BUCKETS, type SpendingBucket } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { Input, Label, Money } from "@/components/ui";

/** Percent inputs kept as strings so the user can clear a field while typing. */
export interface SplitValues {
  needs: string;
  wants: string;
  savings: string;
}

export const DEFAULT_SPLIT: SplitValues = { needs: "50", wants: "30", savings: "20" };

export function splitFromNumbers(needs: number, wants: number, savings: number): SplitValues {
  return { needs: String(needs), wants: String(wants), savings: String(savings) };
}

export function splitToNumbers(v: SplitValues): { needsPct: number; wantsPct: number; savingsPct: number } {
  const n = (s: string) => (s.trim() === "" ? NaN : Number(s));
  return { needsPct: n(v.needs), wantsPct: n(v.wants), savingsPct: n(v.savings) };
}

export function splitOk(v: SplitValues): boolean {
  const s = splitToNumbers(v);
  return splitIsValid(s.needsPct, s.wantsPct, s.savingsPct);
}

const KEY: Record<SpendingBucket, keyof SplitValues> = { NEEDS: "needs", WANTS: "wants", SAVINGS_DEBT: "savings" };
const NAME: Record<SpendingBucket, string> = { NEEDS: "needsPct", WANTS: "wantsPct", SAVINGS_DEBT: "savingsPct" };
const DOT: Record<string, string> = { sky: "bg-sky-500", violet: "bg-violet-500", emerald: "bg-emerald-500" };

/**
 * Three percentage fields (Needs / Wants / Savings & Debt) with live dollar
 * targets and a running total. Inputs carry form names (needsPct, wantsPct,
 * savingsPct) so the component works inside a plain <form action> too.
 */
export function SplitFields({
  monthlyIncome,
  value,
  onChange,
}: {
  monthlyIncome: number;
  value: SplitValues;
  onChange: (next: SplitValues) => void;
}) {
  const nums = splitToNumbers(value);
  const safe = {
    monthlyIncome,
    needsPct: nums.needsPct || 0,
    wantsPct: nums.wantsPct || 0,
    savingsPct: nums.savingsPct || 0,
  };
  const targets = bucketTargets(safe);
  const total = safe.needsPct + safe.wantsPct + safe.savingsPct;
  const valid = splitIsValid(nums.needsPct, nums.wantsPct, nums.savingsPct);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {SPENDING_BUCKETS.map((bucket) => (
          <div key={bucket}>
            <Label htmlFor={`split-${bucket}`} className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", DOT[BUCKET_COLOR[bucket]])} aria-hidden />
              {BUCKET_LABEL[bucket]}
            </Label>
            <div className="relative">
              <Input
                id={`split-${bucket}`}
                name={NAME[bucket]}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                required
                value={value[KEY[bucket]]}
                onChange={(e) => onChange({ ...value, [KEY[bucket]]: e.target.value })}
                className="pr-8"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted" aria-hidden>
                %
              </span>
            </div>
            <p className="mt-1 text-sm font-medium tabular">
              <Money cents={targets[bucket]} />
              <span className="font-normal text-muted"> / month</span>
            </p>
            <p className="mt-1 text-xs text-muted">{BUCKET_DESCRIPTION[bucket]}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={valid ? "text-muted" : "font-medium text-red-600 dark:text-red-400"}>
          {valid ? "Adds up to 100%." : `Adds up to ${Number.isFinite(total) ? total : 0}%. It needs to be exactly 100%.`}
        </span>
        <button type="button" onClick={() => onChange(DEFAULT_SPLIT)} className="font-medium text-accent hover:underline">
          Reset to 50/30/20
        </button>
      </div>
    </div>
  );
}
