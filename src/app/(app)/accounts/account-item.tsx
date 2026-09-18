"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Landmark, Pencil, Trash2 } from "lucide-react";
import { archiveAccount, deleteAccount, type AccountActionState } from "@/server/actions/accounts";
import { ActionNotice, Badge, Button, Money } from "@/components/ui";
import { ACCOUNT_TYPE_LABEL, LIABILITY_TYPES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { AccountForm } from "./account-form";
import type { AccountView } from "./types";

export function AccountItem({ account }: { account: AccountView }) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<AccountActionState>(undefined);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<AccountActionState>) =>
    startTransition(async () => {
      setNotice(await fn());
    });

  const liability = LIABILITY_TYPES.includes(account.type);
  const meta = [
    ACCOUNT_TYPE_LABEL[account.type],
    account.institution,
    account.syncedLabel ?? "manual",
  ].filter(Boolean);

  return (
    <li className={cn("px-4 py-3", account.archived && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {account.synced ? (
            <Landmark className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-border" aria-hidden />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("truncate font-medium", account.archived && "line-through")}>{account.name}</span>
              {account.archived && <Badge>Archived</Badge>}
              {!liability && !account.archived && (
                <Badge tone={account.inSpendable ? "emerald" : "gray"}>
                  {account.inSpendable ? "Spendable" : "Not spendable"}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted">{meta.join(" · ")}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Money cents={account.balance} colored className="mr-2 font-semibold" />
          <Button size="sm" variant="ghost" aria-label={`Edit ${account.name}`} onClick={() => setEditing((v) => !v)}>
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={account.archived ? `Unarchive ${account.name}` : `Archive ${account.name}`}
            disabled={pending}
            onClick={() => run(() => archiveAccount(account.id, !account.archived))}
          >
            {account.archived ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 dark:text-red-400"
            aria-label={`Delete ${account.name}`}
            disabled={pending}
            title={account.txnCount > 0 ? "Has transactions; archive it instead" : "Delete"}
            onClick={() => {
              if (account.txnCount > 0) {
                setNotice({
                  ok: false,
                  error: `${account.name} has ${account.txnCount} transaction${account.txnCount === 1 ? "" : "s"}. Archive it instead to keep your history.`,
                });
                return;
              }
              if (confirm(`Delete ${account.name}? This cannot be undone.`)) run(() => deleteAccount(account.id));
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
      {notice && (
        <div className="mt-3">
          <ActionNotice state={notice} />
        </div>
      )}
      {editing && (
        <div className="mt-3 rounded-lg border border-border bg-background/60 p-4">
          <AccountForm account={account} onDone={() => setEditing(false)} />
        </div>
      )}
    </li>
  );
}
