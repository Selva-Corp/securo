import Link from "next/link";
import { cn } from "@/lib/cn";
import { goalProgress } from "@/lib/budget";
import { formatDate } from "@/lib/dates";
import { GOAL_COLOR_CLASSES, GOAL_KIND_LABEL, goalColor, goalKind, goalVerb } from "@/lib/goals";
import { CategoryIcon } from "@/components/category-icon";
import { Badge, Money, Progress } from "@/components/ui";

export interface GoalCardGoal {
  id: string;
  name: string;
  kind: string;
  targetAmount: number;
  targetDate: Date | null;
  icon: string;
  color: string;
  saved: number;
}

/** Summary card for one goal. Links to the goal's detail page. `compact` drops the footer for snapshots. */
export function GoalCard({ goal, compact = false, className }: { goal: GoalCardGoal; compact?: boolean; className?: string }) {
  const progress = goalProgress(goal);
  const color = GOAL_COLOR_CLASSES[goalColor(goal.color)];
  const kind = goalKind(goal.kind);
  return (
    <Link
      href={`/goals/${goal.id}`}
      className={cn("block rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-border/20", className)}
    >
      <div className="flex items-start gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", color.chip)}>
          <CategoryIcon name={goal.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium">{goal.name}</p>
            {!compact && <Badge tone={kind === "DEBT" ? "amber" : "emerald"}>{GOAL_KIND_LABEL[kind]}</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            <Money cents={goal.saved} className="font-medium text-foreground" /> of <Money cents={goal.targetAmount} /> {goalVerb(goal.kind)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Progress pct={progress.pct} color={color.bar} className="flex-1" />
        <span className="tabular w-10 text-right text-xs font-medium text-muted">{progress.pct}%</span>
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted">
          <span>{goal.targetDate ? `Target ${formatDate(goal.targetDate)}` : "No target date"}</span>
          {progress.remaining === 0 ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">Done</span>
          ) : progress.monthlyNeeded !== null ? (
            <span>
              Save <Money cents={progress.monthlyNeeded} className="font-medium text-foreground" />/month to hit it
            </span>
          ) : (
            <span>
              <Money cents={progress.remaining} /> to go
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
