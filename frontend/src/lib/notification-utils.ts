import type { TFunction } from 'i18next'
import type { Notification } from '../types'

/** Mirror of the backend's `notification_kinds.ALL_KINDS`, in preference order. */
export const NOTIFICATION_KINDS = [
  'upcoming_bill',
  'new_subscription_detected',
  'price_increase',
  'charge_after_cancel',
  'large_transaction',
  'low_balance',
  'unusual_spend',
  'budget_exceeded',
  'sync_failed',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/** Where a tap lands. Mirrors the backend's `CLICK_PATH`, with entity deep links where the UI supports them. */
export function notificationPath(n: Pick<Notification, 'kind' | 'payload' | 'entity_id'>): string {
  switch (n.kind) {
    case 'upcoming_bill':
      return n.payload?.subscription_id ? '/subscriptions' : '/recurring'
    case 'new_subscription_detected':
    case 'price_increase':
    case 'charge_after_cancel':
      return '/subscriptions'
    case 'large_transaction':
      return n.entity_id ? `/transactions?highlight=${n.entity_id}` : '/transactions'
    case 'low_balance':
    case 'sync_failed':
      return '/accounts'
    case 'unusual_spend':
      return '/reports'
    case 'budget_exceeded':
      return '/budgets'
    default:
      return '/notifications'
  }
}

/** "3h ago"-style label using Intl, falling back to a date for anything older than a week. */
export function relativeTime(iso: string, locale: string, t: TFunction, now: Date = new Date()): string {
  const then = new Date(iso)
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return t('notifications.justNow')
  let formatter: Intl.RelativeTimeFormat
  try {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  } catch {
    formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  }
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return formatter.format(Math.round(seconds / 3600), 'hour')
  if (abs < 7 * 86_400) return formatter.format(Math.round(seconds / 86_400), 'day')
  return then.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}
