"use client";

import { useState, useTransition } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { syncAllBanks, type ConnectionActionState } from "@/server/actions/connections";
import { ConnectBankForm, ConnectionCard, type ConnectionSummary } from "@/components/connect-bank";
import { ActionNotice, Button, CardTitle } from "@/components/ui";

export function BankConnections({ connections }: { connections: ConnectionSummary[] }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<ConnectionActionState>(undefined);
  const [syncing, startSync] = useTransition();

  const syncAll = () =>
    startSync(async () => {
      setNotice(await syncAllBanks());
    });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Bank connections</CardTitle>
        <div className="flex items-center gap-2">
          {connections.length > 0 && (
            <Button size="sm" variant="secondary" disabled={syncing} onClick={syncAll}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />
              {syncing ? "Syncing…" : "Sync all"}
            </Button>
          )}
          <Button size="sm" variant={open ? "ghost" : "primary"} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <Plus className="h-4 w-4" aria-hidden /> {open ? "Close" : "Connect a bank"}
          </Button>
        </div>
      </div>
      <ActionNotice state={notice} />
      {open && (
        <div className="rounded-xl border border-border bg-card p-4">
          <ConnectBankForm />
        </div>
      )}
      {connections.length === 0 && !open ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No banks connected. Connect one to import accounts and transactions automatically, or add accounts by hand below.
        </p>
      ) : (
        <div className="space-y-3">
          {connections.map((c) => (
            <ConnectionCard key={c.id} connection={c} />
          ))}
        </div>
      )}
    </section>
  );
}
