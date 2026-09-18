"use client";

import { useActionState } from "react";
import { createGoal, updateGoal } from "@/server/actions/goals";
import { GOAL_KINDS } from "@/lib/constants";
import { GOAL_COLORS, GOAL_COLOR_CLASSES, GOAL_COLOR_LABEL, GOAL_KIND_LABEL } from "@/lib/goals";
import { centsToInput } from "@/lib/money";
import { cn } from "@/lib/cn";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "@/components/category-icon";
import { ActionNotice, Button, Field, Input, MoneyInput, Select } from "@/components/ui";

export interface GoalFormValues {
  id: string;
  name: string;
  kind: string;
  targetAmount: number;
  /** yyyy-MM-dd or "" */
  targetDate: string;
  icon: string;
  color: string;
}

export function GoalForm({ goal }: { goal?: GoalFormValues }) {
  const [state, action, pending] = useActionState(goal ? updateGoal : createGoal, undefined);
  return (
    <form action={action} className="space-y-4">
      {goal && <input type="hidden" name="goalId" value={goal.id} />}
      <ActionNotice state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <Input name="name" defaultValue={goal?.name ?? ""} placeholder="Emergency fund" maxLength={80} required />
        </Field>
        <Field label="Kind">
          <Select name="kind" defaultValue={goal?.kind ?? "SAVINGS"}>
            {GOAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {GOAL_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target amount">
          <MoneyInput name="targetAmount" defaultValue={goal ? centsToInput(goal.targetAmount) : ""} required />
        </Field>
        <Field label="Target date" hint="Optional. Used to suggest a monthly amount.">
          <Input name="targetDate" type="date" defaultValue={goal?.targetDate ?? ""} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium">Icon</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_ICON_NAMES.map((name) => (
            <label
              key={name}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted hover:bg-border/40 has-checked:border-accent has-checked:bg-accent/15 has-checked:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-accent/50"
              title={name}
            >
              <input type="radio" name="icon" value={name} defaultChecked={(goal?.icon ?? "target") === name} className="sr-only" />
              <CategoryIcon name={name} />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-2">
          {GOAL_COLORS.map((color) => (
            <label
              key={color}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted hover:bg-border/40 has-checked:border-accent has-checked:bg-accent/15 has-checked:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-accent/50"
            >
              <input type="radio" name="color" value={color} defaultChecked={(goal?.color ?? "emerald") === color} className="sr-only" />
              <span className={cn("h-3 w-3 rounded-full", GOAL_COLOR_CLASSES[color].swatch)} aria-hidden />
              {GOAL_COLOR_LABEL[color]}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : goal ? "Save changes" : "Create goal"}
      </Button>
    </form>
  );
}
