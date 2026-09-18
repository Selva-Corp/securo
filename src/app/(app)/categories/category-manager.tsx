"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { BUCKETS, BUCKET_DESCRIPTION, BUCKET_LABEL, type Bucket } from "@/lib/constants";
import { centsToInput } from "@/lib/money";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "@/components/category-icon";
import { Badge, Button, Field, FormError, Input, Money, Select } from "@/components/ui";
import {
  archiveCategory,
  createCategoryForm,
  deleteCategory,
  updateCategory,
  type CategoryActionState,
} from "@/server/actions/categories";

export interface CategoryRowData {
  id: string;
  name: string;
  bucket: Bucket;
  icon: string;
  monthlyLimit: number | null;
  archived: boolean;
  monthCount: number;
  monthSpent: number;
}

const BUCKET_TEXT: Record<Bucket, string> = {
  NEEDS: "text-sky-600 dark:text-sky-300",
  WANTS: "text-violet-600 dark:text-violet-300",
  SAVINGS_DEBT: "text-emerald-600 dark:text-emerald-300",
  INCOME: "text-amber-600 dark:text-amber-300",
};

export function CategoryManager({ categories, currency }: { categories: CategoryRowData[]; currency: string }) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        {creating ? (
          <CreateForm onClose={() => setCreating(false)} />
        ) : (
          <Button variant="secondary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New category
          </Button>
        )}
      </div>

      {BUCKETS.map((bucket) => {
        const rows = categories.filter((c) => c.bucket === bucket);
        return (
          <section key={bucket}>
            <div className="mb-2">
              <h2 className={cn("text-sm font-semibold uppercase tracking-wide", BUCKET_TEXT[bucket])}>{BUCKET_LABEL[bucket]}</h2>
              <p className="text-xs text-muted">
                {bucket === "INCOME" ? "Paychecks and other money coming in." : BUCKET_DESCRIPTION[bucket]}
              </p>
            </div>
            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
                No {BUCKET_LABEL[bucket]} categories yet.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {rows.map((row) => (
                  <CategoryRow
                    key={row.id}
                    row={row}
                    currency={currency}
                    editing={editingId === row.id}
                    onEdit={() => setEditingId(row.id)}
                    onClose={() => setEditingId(null)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CategoryRow({
  row,
  currency,
  editing,
  onEdit,
  onClose,
}: {
  row: CategoryRowData;
  currency: string;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggleArchive = () => {
    setError(null);
    startTransition(async () => {
      const r = await archiveCategory(row.id, !row.archived);
      if (r && !r.ok) setError(r.error);
    });
  };

  const remove = () => {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteCategory(row.id);
      if (r && !r.ok) setError(r.error);
    });
  };

  if (editing) return <EditForm row={row} onClose={onClose} />;

  return (
    <li className={cn("px-3 py-3 sm:px-4", row.archived && "opacity-60")}>
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-border/50", BUCKET_TEXT[row.bucket])}>
          <CategoryIcon name={row.icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("truncate text-sm font-medium", row.archived && "line-through")}>{row.name}</span>
            {row.archived && <Badge>Archived</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {row.monthCount === 0 ? "No activity this month" : `${row.monthCount} transaction${row.monthCount === 1 ? "" : "s"} this month`}
            {row.monthlyLimit !== null && row.bucket !== "INCOME" && (
              <>
                {" · limit "}
                <Money cents={row.monthlyLimit} currency={currency} />
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <Money cents={row.monthSpent} currency={currency} className="block text-sm font-semibold" />
          {row.monthlyLimit !== null && row.bucket !== "INCOME" && (
            <span className={cn("text-xs", row.monthSpent > row.monthlyLimit ? "text-red-600 dark:text-red-400" : "text-muted")}>
              of <Money cents={row.monthlyLimit} currency={currency} />
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Edit" onClick={onEdit} disabled={busy}>
            <Pencil className="h-4 w-4" />
          </IconButton>
          <IconButton label={row.archived ? "Unarchive" : "Archive"} onClick={toggleArchive} disabled={busy}>
            {row.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </IconButton>
          <IconButton label="Delete" onClick={remove} disabled={busy}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md p-2 text-muted hover:bg-border/40 hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
      {CATEGORY_ICON_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          aria-label={name}
          title={name}
          onClick={() => onChange(name)}
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
            value === name ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:bg-border/40",
          )}
        >
          <CategoryIcon name={name} className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

function useCloseOnSuccess(state: CategoryActionState, onClose: () => void) {
  const seen = useRef(state);
  useEffect(() => {
    if (state !== seen.current) {
      seen.current = state;
      if (state?.ok) onClose();
    }
  }, [state, onClose]);
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(createCategoryForm, undefined);
  const [icon, setIcon] = useState("tag");
  useCloseOnSuccess(state, onClose);

  return (
    <form action={action} className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">New category</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-border/40">
          <X className="h-4 w-4" />
        </button>
      </div>
      <FormError message={state && !state.ok ? state.error : undefined} />
      <input type="hidden" name="icon" value={icon} />
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <Input name="name" required maxLength={60} autoFocus placeholder="e.g. Pets" />
        </Field>
        <Field label="Bucket">
          <Select name="bucket" defaultValue="NEEDS">
            {BUCKETS.map((b) => (
              <option key={b} value={b}>
                {BUCKET_LABEL[b]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Monthly limit" hint="Optional">
          <Input name="monthlyLimit" inputMode="decimal" placeholder="0.00" />
        </Field>
      </div>
      <div className="mt-3">
        <div className="mb-1 text-sm font-medium">Icon</div>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create"}
        </Button>
      </div>
    </form>
  );
}

function EditForm({ row, onClose }: { row: CategoryRowData; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateCategory, undefined);
  const [icon, setIcon] = useState(row.icon);
  useCloseOnSuccess(state, onClose);

  return (
    <li className="bg-background/40 px-3 py-4 sm:px-4">
      <form action={action}>
        <input type="hidden" name="id" value={row.id} />
        <input type="hidden" name="icon" value={icon} />
        <FormError message={state && !state.ok ? state.error : undefined} />
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Field label="Name">
            <Input name="name" defaultValue={row.name} required maxLength={60} autoFocus />
          </Field>
          <Field label="Bucket">
            <Select name="bucket" defaultValue={row.bucket}>
              {BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {BUCKET_LABEL[b]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Monthly limit" hint="Leave blank for none">
            <Input name="monthlyLimit" inputMode="decimal" defaultValue={row.monthlyLimit !== null ? centsToInput(row.monthlyLimit) : ""} />
          </Field>
        </div>
        <div className="mt-3">
          <div className="mb-1 text-sm font-medium">Icon</div>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </li>
  );
}
