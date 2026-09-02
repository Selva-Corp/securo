import { useTranslation } from 'react-i18next'
import { CalendarClock, Layers, Repeat, Wallet } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/format'
import type { SubscriptionSummary } from '@/types'

interface SummaryHeaderProps {
  summary: SubscriptionSummary | undefined
  locale: string
  mask: (value: string) => string
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-4 min-w-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="text-muted-foreground/80 [&_svg]:size-3.5">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1.5 text-xl sm:text-2xl font-semibold tabular-nums text-foreground truncate">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground truncate">{hint}</p>}
    </div>
  )
}

/**
 * The Rocket Money "what am I paying for" strip: monthly and annual cost,
 * how many subscriptions are active, and what is due in the next 30 days.
 * Totals are per currency; the workspace currency comes first and any other
 * currencies are shown as a hint rather than converted.
 */
export function SummaryHeader({ summary, locale, mask }: SummaryHeaderProps) {
  const { t } = useTranslation()

  if (!summary) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
    )
  }

  const [primary, ...others] = summary.totals
  const otherHint =
    others.length > 0
      ? t('subscriptions.summary.alsoIn', {
          amounts: others.map((tot) => mask(formatCurrency(Number(tot.monthly), tot.currency, locale))).join(', '),
        })
      : undefined
  const activeCount = summary.tracked_count + summary.suggested_count

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <StatCard
        icon={<Wallet />}
        label={t('subscriptions.summary.monthly')}
        value={primary ? mask(formatCurrency(Number(primary.monthly), primary.currency, locale)) : '—'}
        hint={otherHint}
      />
      <StatCard
        icon={<Repeat />}
        label={t('subscriptions.summary.annual')}
        value={primary ? mask(formatCurrency(Number(primary.annual), primary.currency, locale)) : '—'}
      />
      <StatCard
        icon={<Layers />}
        label={t('subscriptions.summary.active')}
        value={activeCount}
        hint={
          summary.suggested_count > 0
            ? t('subscriptions.summary.toReview', { count: summary.suggested_count })
            : undefined
        }
      />
      <StatCard
        icon={<CalendarClock />}
        label={t('subscriptions.summary.upcoming')}
        value={summary.upcoming.length}
        hint={
          summary.upcoming[0]
            ? `${summary.upcoming[0].display_name} · ${mask(
                formatCurrency(Number(summary.upcoming[0].amount), summary.upcoming[0].currency, locale),
              )}`
            : undefined
        }
      />
    </div>
  )
}
