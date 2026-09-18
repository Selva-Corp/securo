"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthKey, monthLabel, parseMonthKey, shiftMonth } from "@/lib/dates";

/**
 * Previous / next month control driven by the `month` search param (YYYY-MM).
 * Other search params are preserved.
 */
export function MonthNav({ month }: { month: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = monthKey(parseMonthKey(month));
  const thisMonth = monthKey(new Date());

  const href = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("month", key);
    return `${pathname}?${next.toString()}`;
  };

  const linkClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-border/40";

  return (
    <div className="flex items-center gap-2">
      <Link href={href(shiftMonth(current, -1))} className={linkClass} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <div className="min-w-36 text-center text-sm font-medium">{monthLabel(parseMonthKey(current))}</div>
      <Link href={href(shiftMonth(current, 1))} className={linkClass} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </Link>
      {current !== thisMonth && (
        <Link href={href(thisMonth)} className="ml-1 text-sm font-medium text-accent hover:underline">
          Today
        </Link>
      )}
    </div>
  );
}
