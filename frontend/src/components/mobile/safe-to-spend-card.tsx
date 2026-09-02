import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MobileSummary } from '@/types'

interface SafeToSpendCardProps {
  summary: MobileSummary | undefined
  locale: string
  mask: (value: string) => string
}

/** The Rocket Money hero number: what is left after bills and budgets. */
export function SafeToSpendCard({ summary, locale, mask }: SafeToSpendCardProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  if (!summary) {
    return <Skeleton className="h-40 rounded-2xl" />
  }

  const cur = summary.primary_currency
  const safe = Number(summary.safe_to_spend_primary)
  const negative = safe < 0
  const money = (v: number | string) => mask(formatCurrency(Number(v), cur, locale))

  return (
    <section
      className={cn(
        'rounded-2xl p-5 text-primary-foreground shadow-md',
        negative ? 'bg-destructive' : 'bg-primary',
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">{t('home.safeToSpend')}</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{money(safe)}</p>
      <p className="mt-1 text-sm opacity-90">
        {t('home.perDay', { amount: money(summary.safe_per_day_primary), count: summary.days_left_in_month })}
      </p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-4 flex w-full items-center justify-between text-xs font-medium opacity-90"
        aria-expanded={open}
      >
        <span>{t('home.howCalculated')}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <dl className="mt-2 space-y-1 text-sm border-t border-white/20 pt-2">
          <div className="flex justify-between">
            <dt className="opacity-80">{t('home.cashOnHand')}</dt>
            <dd className="tabular-nums">{money(summary.cash_balance_primary)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="opacity-80">{t('home.billsDueThisMonth')}</dt>
            <dd className="tabular-nums">− {money(summary.upcoming_bills_primary)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="opacity-80">{t('home.budgetsLeft')}</dt>
            <dd className="tabular-nums">− {money(summary.budget_remaining_primary)}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}
