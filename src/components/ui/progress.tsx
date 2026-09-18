import { cn } from "@/lib/cn";

const fills: Record<string, string> = {
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-muted",
};

/** Horizontal progress bar. `pct` may exceed 100; the bar caps and turns red. */
export function Progress({
  pct,
  color = "emerald",
  className,
  overColor = "red",
}: {
  pct: number;
  color?: keyof typeof fills;
  overColor?: keyof typeof fills;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fill = pct > 100 ? fills[overColor] : fills[color];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-border", className)} role="progressbar" aria-valuenow={clamped}>
      <div className={cn("h-full rounded-full transition-all", fill)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
