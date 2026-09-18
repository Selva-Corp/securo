import type { MonthSummary } from "@/lib/budget";
import { Badge } from "@/components/ui";

const STATUS: Record<MonthSummary["status"], { label: string; tone: "emerald" | "sky" | "red" }> = {
  under: { label: "Under budget", tone: "emerald" },
  "on-track": { label: "On track", tone: "sky" },
  over: { label: "Over budget", tone: "red" },
};

export function statusLabel(status: MonthSummary["status"]): string {
  return STATUS[status].label;
}

export function StatusPill({ status, className }: { status: MonthSummary["status"]; className?: string }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} className={className}>
      {s.label}
    </Badge>
  );
}
