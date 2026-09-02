import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ChartNoAxesCombined,
  Link2Off,
  PiggyBank,
  Receipt,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  upcoming_bill: CalendarClock,
  new_subscription_detected: Sparkles,
  price_increase: TrendingUp,
  charge_after_cancel: AlertTriangle,
  large_transaction: Receipt,
  low_balance: AlertTriangle,
  unusual_spend: ChartNoAxesCombined,
  budget_exceeded: PiggyBank,
  sync_failed: Link2Off,
}

export function NotificationKindIcon({ kind }: { kind: string }) {
  const Icon = ICONS[kind] ?? Bell
  return <Icon />
}
