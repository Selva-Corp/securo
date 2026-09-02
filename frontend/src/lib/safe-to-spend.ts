/**
 * Client-side mirror of `mobile_dashboard_service` arithmetic, so the home
 * screen can recompute the headline figure when the user toggles what counts.
 */

export interface SafeToSpendInput {
  cash: number
  upcomingBills: number
  budgetRemaining: number
}

export function safeToSpend({ cash, upcomingBills, budgetRemaining }: SafeToSpendInput): number {
  return round2(cash - upcomingBills - budgetRemaining)
}

export function perDay(amount: number, daysLeft: number): number {
  if (daysLeft <= 0) return round2(Math.max(amount, 0))
  return round2(Math.max(amount, 0) / daysLeft)
}

export function daysLeftInMonth(today: Date = new Date()): number {
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return end.getDate() - today.getDate() + 1
}

/** Ring progress for a budget: 0..1, clamped, with null for "no budget". */
export function budgetProgress(actual: number, budget: number | null): number | null {
  if (budget == null || budget <= 0) return null
  return Math.max(0, Math.min(1, actual / budget))
}

export function greetingKey(hour: number): 'home.greetingMorning' | 'home.greetingAfternoon' | 'home.greetingEvening' {
  if (hour < 12) return 'home.greetingMorning'
  if (hour < 18) return 'home.greetingAfternoon'
  return 'home.greetingEvening'
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
