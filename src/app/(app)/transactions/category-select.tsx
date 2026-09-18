"use client";

import { Select } from "@/components/ui";
import { BUCKETS, BUCKET_LABEL, type Bucket } from "@/lib/constants";

export interface CategoryOption {
  id: string;
  name: string;
  bucket: Bucket;
  archived: boolean;
}

/** Category dropdown grouped by bucket. Archived categories only show when currently selected. */
export function CategorySelect({
  categories,
  name = "categoryId",
  defaultValue,
  value,
  onChange,
  placeholder = "Uncategorized",
  className,
  id,
}: {
  categories: CategoryOption[];
  name?: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const selected = value ?? defaultValue ?? "";
  return (
    <Select
      id={id}
      name={name}
      className={className}
      {...(value !== undefined ? { value, onChange: (e) => onChange?.(e.target.value) } : { defaultValue: defaultValue ?? "" })}
    >
      <option value="">{placeholder}</option>
      {BUCKETS.map((bucket) => {
        const options = categories.filter((c) => c.bucket === bucket && (!c.archived || c.id === selected));
        if (options.length === 0) return null;
        return (
          <optgroup key={bucket} label={BUCKET_LABEL[bucket]}>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? " (archived)" : ""}
              </option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
}
