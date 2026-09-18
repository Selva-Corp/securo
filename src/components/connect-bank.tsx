"use client";

import { useActionState, useState, useTransition } from "react";
import { Landmark, RefreshCw, Unplug } from "lucide-react";
import { connectBank, disconnectBank, reconnectBank, syncBank, type ConnectionActionState } from "@/server/actions/connections";
import { Badge, Button, Field, FormError, Input, Textarea } from "@/components/ui";
import { SIMPLEFIN_BRIDGE_URL } from "@/lib/simplefin";

function Notice({ state }: { state: ConnectionActionState }) {
  if (!state) return null;
  if (!state.ok) return <FormError message={state.error} />;
  return (
    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
      {state.message}
    </p>
  );
}

/** Paste-a-token form for a new SimpleFIN connection. */
export function ConnectBankForm({ onDone }: { onDone?: () => void }) {
  const [state, action, pending] = useActionState(async (prev: ConnectionActionState, fd: FormData) => {
    const next = await connectBank(prev, fd);
    if (next?.ok) onDone?.();
    return next;
  }, undefined);

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted">
        Securo syncs through{" "}
        <a href={`${SIMPLEFIN_BRIDGE_URL}/`} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
          SimpleFIN Bridge
        </a>
        , a read-only service. Sign in there, link your bank, then create a setup token and paste it below. Each token works once.
      </p>
      <Notice state={state} />
      <Field label="Setup token">
        <Textarea name="setupToken" rows={3} required placeholder="aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0v…" className="font-mono text-xs" />
      </Field>
      <Field label="Nickname" hint="Optional. Defaults to the bank name.">
        <Input name="displayName" maxLength={80} placeholder="Chase" />
      </Field>
      <Button type="submit" disabled={pending}>
        <Landmark className="h-4 w-4" aria-hidden />
        {pending ? "Connecting and importing…" : "Connect bank"}
      </Button>
    </form>
  );
}

export interface ConnectionSummary {
  id: string;
  displayName: string;
  status: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
  accountCount: number;
}

/** One row per connection with sync, reconnect, and disconnect controls. */
export function ConnectionCard({ connection }: { connection: ConnectionSummary }) {
  const [notice, setNotice] = useState<ConnectionActionState>(undefined);
  const [isPending, startTransition] = useTransition();
  const [showReconnect, setShowReconnect] = useState(connection.status === "NEEDS_RECONNECT");
  const [reconnectState, reconnectAction, reconnectPending] = useActionState(reconnectBank, undefined);

  const run = (fn: () => Promise<ConnectionActionState>) =>
    startTransition(async () => {
      setNotice(await fn());
    });

  const tone = connection.status === "ACTIVE" ? "emerald" : connection.status === "NEEDS_RECONNECT" ? "amber" : "red";
  const label = connection.status === "ACTIVE" ? "Connected" : connection.status === "NEEDS_RECONNECT" ? "Needs reconnect" : "Error";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Landmark className="h-5 w-5 text-muted" aria-hidden />
          <div>
            <div className="font-medium">{connection.displayName}</div>
            <div className="text-xs text-muted">
              {connection.accountCount} account{connection.accountCount === 1 ? "" : "s"}
              {connection.lastSyncedAt ? ` · synced ${connection.lastSyncedAt.toLocaleString()}` : " · never synced"}
            </div>
          </div>
          <Badge tone={tone}>{label}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={isPending} onClick={() => run(() => syncBank(connection.id))}>
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} aria-hidden /> Sync now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowReconnect((v) => !v)}>
            Reconnect
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600"
            disabled={isPending}
            onClick={() => {
              if (confirm("Disconnect this bank? Its accounts and history stay, but stop syncing.")) {
                run(() => disconnectBank(connection.id));
              }
            }}
          >
            <Unplug className="h-4 w-4" aria-hidden /> Disconnect
          </Button>
        </div>
      </div>
      {connection.lastError && <p className="mt-3 text-sm text-red-600">{connection.lastError}</p>}
      <div className="mt-3">
        <Notice state={notice} />
      </div>
      {showReconnect && (
        <form action={reconnectAction} className="mt-4 space-y-3 border-t border-border pt-4">
          <input type="hidden" name="connectionId" value={connection.id} />
          <Notice state={reconnectState} />
          <Field label="Fresh setup token" hint="Generate a new one at SimpleFIN Bridge.">
            <Textarea name="setupToken" rows={2} required className="font-mono text-xs" />
          </Field>
          <Button size="sm" type="submit" disabled={reconnectPending}>
            {reconnectPending ? "Reconnecting…" : "Reconnect"}
          </Button>
        </form>
      )}
    </div>
  );
}
