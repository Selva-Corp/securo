"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui";
import { BUCKETS, BUCKET_LABEL } from "@/lib/constants";
import type { CategoryOption } from "./category-select";

export interface TransactionFilters {
  account: string;
  category: string;
  bucket: string;
  q: string;
  unreviewed: boolean;
}

/** Filter controls that write their state to the URL search params. */
export function FilterBar({
  accounts,
  categories,
  filters,
}: {
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
  filters: TransactionFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(filters.q);

  useEffect(() => setQ(filters.q), [filters.q]);

  const update = (patch: Partial<Record<keyof TransactionFilters, string>>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Debounce the payee search.
  useEffect(() => {
    if (q === filters.q) return;
    const t = window.setTimeout(() => update({ q: q.trim() }), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = filters.account || filters.category || filters.bucket || filters.q || filters.unreviewed;
  const categoryOptions = categories.filter(
    (c) => (!filters.bucket || filters.bucket === "NONE" ? true : c.bucket === filters.bucket) && (!c.archived || c.id === filters.category),
  );

  return (
    <div className="mb-4 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
      <div className="relative flex-1 md:min-w-56">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search payee"
          aria-label="Search payee"
          className="pl-9"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        <Select
          aria-label="Account"
          value={filters.account}
          onChange={(e) => update({ account: e.target.value })}
          className="md:w-44"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Bucket"
          value={filters.bucket}
          onChange={(e) => update({ bucket: e.target.value, category: "" })}
          className="md:w-40"
        >
          <option value="">All buckets</option>
          {BUCKETS.map((b) => (
            <option key={b} value={b}>
              {BUCKET_LABEL[b]}
            </option>
          ))}
          <option value="NONE">Uncategorized</option>
        </Select>
        {filters.bucket !== "NONE" && (
          <Select
            aria-label="Category"
            value={filters.category}
            onChange={(e) => update({ category: e.target.value })}
            className="md:w-44"
          >
            <option value="">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm">
          <input
            type="checkbox"
            checked={filters.unreviewed}
            onChange={(e) => update({ unreviewed: e.target.checked ? "1" : "" })}
            className="h-4 w-4 accent-accent"
          />
          Unreviewed only
        </label>
      </div>
      {active && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            update({ account: "", category: "", bucket: "", q: "", unreviewed: "" });
          }}
          className="inline-flex h-10 items-center gap-1 self-start rounded-lg px-2 text-sm text-muted hover:text-foreground"
        >
          <X className="h-4 w-4" /> Clear
        </button>
      )}
    </div>
  );
}
