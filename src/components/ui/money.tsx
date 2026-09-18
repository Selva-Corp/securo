import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

/** Renders a cents amount with tabular digits and optional sign coloring. */
export function Money({
  cents,
  currency = "USD",
  signed = false,
  colored = false,
  className,
}: {
  cents: number;
  currency?: string;
  signed?: boolean;
  colored?: boolean;
  className?: string;
}) {
  const tone = colored ? (cents < 0 ? "text-red-600 dark:text-red-400" : cents > 0 ? "text-emerald-600 dark:text-emerald-400" : "") : "";
  return <span className={cn("tabular", tone, className)}>{formatMoney(cents, currency, { signed })}</span>;
}
