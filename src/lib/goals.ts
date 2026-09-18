/**
 * Presentation helpers for goals: color families, kind labels and wording.
 * Tailwind v4 only emits classes it can see in source, so every class is
 * written out in full here.
 */
import type { GoalKind } from "./constants";

export const GOAL_COLORS = ["emerald", "sky", "violet", "amber", "rose"] as const;
export type GoalColor = (typeof GOAL_COLORS)[number];

export const GOAL_COLOR_LABEL: Record<GoalColor, string> = {
  emerald: "Green",
  sky: "Blue",
  violet: "Purple",
  amber: "Amber",
  rose: "Rose",
};

export const GOAL_COLOR_CLASSES: Record<GoalColor, { bar: string; chip: string; swatch: string }> = {
  emerald: {
    bar: "emerald",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    swatch: "bg-emerald-500",
  },
  sky: {
    bar: "sky",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    swatch: "bg-sky-500",
  },
  violet: {
    bar: "violet",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    swatch: "bg-violet-500",
  },
  amber: {
    bar: "amber",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    swatch: "bg-amber-500",
  },
  rose: {
    // The shared Progress bar has no rose fill; red is the closest family it knows.
    bar: "red",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    swatch: "bg-rose-500",
  },
};

export function goalColor(value: string | null | undefined): GoalColor {
  return (GOAL_COLORS as readonly string[]).includes(value ?? "") ? (value as GoalColor) : "emerald";
}

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  SAVINGS: "Savings",
  DEBT: "Debt payoff",
};

export function goalKind(value: string | null | undefined): GoalKind {
  return value === "DEBT" ? "DEBT" : "SAVINGS";
}

/** "saved" for savings goals, "paid off" for debt goals. */
export function goalVerb(kind: string): string {
  return goalKind(kind) === "DEBT" ? "paid off" : "saved";
}
