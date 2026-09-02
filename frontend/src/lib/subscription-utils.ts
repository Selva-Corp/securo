/**
 * Pure helpers for the subscriptions hub (fork feature). Mirrors the backend's
 * `subscription_service.MONTHLY_FACTOR` so client-side totals agree with the
 * summary endpoint.
 */

export type SubscriptionCadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
export type SubscriptionStatus = 'suggested' | 'tracked' | 'ignored' | 'cancelled'

export const SUBSCRIPTION_CADENCES: readonly SubscriptionCadence[] = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
] as const

const MONTHLY_FACTOR: Record<SubscriptionCadence, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function isCadence(value: string): value is SubscriptionCadence {
  return (SUBSCRIPTION_CADENCES as readonly string[]).includes(value)
}

/** Per-month cost of a charge that repeats at `cadence`, rounded to cents. */
export function monthlyEquivalent(amount: number | string, cadence: string): number {
  const factor = isCadence(cadence) ? MONTHLY_FACTOR[cadence] : 1
  return Math.round(toNumber(amount) * factor * 100) / 100
}

/** Per-year cost, rounded to cents. */
export function annualize(amount: number | string, cadence: string): number {
  return Math.round(monthlyEquivalent(amount, cadence) * 12 * 100) / 100
}

export function cadenceLabelKey(cadence: string): string {
  return `subscriptions.cadence.${isCadence(cadence) ? cadence : 'monthly'}`
}

export interface PricePoint {
  date: string
  amount: number | string
}

/** Direction of the most recent price change, or null when the price never moved. */
export function priceTrend(history: PricePoint[] | null | undefined): 'up' | 'down' | null {
  if (!history || history.length < 2) return null
  const last = toNumber(history[history.length - 1].amount)
  const previous = toNumber(history[history.length - 2].amount)
  if (last > previous) return 'up'
  if (last < previous) return 'down'
  return null
}

/** Up to two initials for an avatar fallback ("Amazon Prime" → "AP"). */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  if (words.length === 0) return '?'
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/** Whole days from `today` to an ISO date; negative when the date has passed. */
export function daysUntil(iso: string, today: Date = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number)
  const target = Date.UTC(y, m - 1, d)
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target - base) / 86_400_000)
}

/** Sum of monthly equivalents per currency for the rows that count as active. */
export function monthlyTotalsByCurrency(
  rows: { amount: number | string; cadence: string; currency: string; status: string; is_lapsed?: boolean }[],
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const row of rows) {
    if (row.status !== 'tracked' && row.status !== 'suggested') continue
    if (row.is_lapsed) continue
    totals[row.currency] = Math.round(((totals[row.currency] ?? 0) + monthlyEquivalent(row.amount, row.cadence)) * 100) / 100
  }
  return totals
}
