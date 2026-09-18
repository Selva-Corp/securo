"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { CategoryIcon } from "@/components/category-icon";
import { Money, Progress } from "@/components/ui";

export interface CategoryRow {
  categoryId: string;
  name: string;
  icon: string;
  spent: number;
  limit: number | null;
}

/**
 * Category rows for one bucket. Rows with nothing spent and no limit are
 * tucked behind a "show all" toggle so the table stays focused.
 */
export function CategoryTable({ rows, color }: { rows: CategoryRow[]; color: string }) {
  const [showAll, setShowAll] = useState(false);
  const active = rows.filter((r) => r.spent !== 0 || r.limit !== null);
  const hidden = rows.length - active.length;
  const visible = showAll ? rows : active;

  if (rows.length === 0) {
    return <p className="text-sm text-muted">No categories in this bucket yet.</p>;
  }

  return (
    <div>
      {visible.length === 0 ? (
        <p className="py-2 text-sm text-muted">Nothing spent here yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((r) => {
            const over = r.limit !== null && r.limit > 0 && r.spent > r.limit;
            const pct = r.limit && r.limit > 0 ? (r.spent / r.limit) * 100 : 0;
            return (
              <li key={r.categoryId} className="py-2.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-border/50 text-muted">
                    <CategoryIcon name={r.icon} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                  <span className="text-right text-sm">
                    <Money cents={r.spent} className={cn("font-medium", over && "text-red-600 dark:text-red-400")} />
                    {r.limit !== null && (
                      <span className="text-muted">
                        {" "}
                        / <Money cents={r.limit} />
                      </span>
                    )}
                  </span>
                </div>
                {r.limit !== null && r.limit > 0 && (
                  <div className="mt-1.5 flex items-center gap-2 pl-11">
                    <Progress pct={pct} color={color} className="h-1.5 flex-1" />
                    <span className={cn("tabular w-16 text-right text-xs", over ? "font-medium text-red-600 dark:text-red-400" : "text-muted")}>
                      {over ? (
                        <>
                          <Money cents={r.spent - r.limit} /> over
                        </>
                      ) : (
                        `${Math.round(pct)}%`
                      )}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-xs font-medium text-accent hover:underline"
        >
          {showAll ? "Hide unused categories" : `Show all (${hidden} unused)`}
        </button>
      )}
    </div>
  );
}
