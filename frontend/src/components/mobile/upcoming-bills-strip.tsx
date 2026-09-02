import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { formatShortDate } from '@/components/subscriptions/subscription-card'
import { daysUntil } from '@/lib/subscription-utils'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MobileSummary } from '@/types'

interface UpcomingBillsStripProps {
  items: MobileSummary['upcoming'] | undefined
  locale: string
  dateLocale: string
  mask: (value: string) => string
}

export function UpcomingBillsStrip({ items, locale, dateLocale, mask }: UpcomingBillsStripProps) {
  const { t } = useTranslation()

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">{t('home.upcoming')}</h2>
        <Link to="/recurring" className="text-xs text-primary font-medium flex items-center gap-0.5">
          {t('common.view')}
          <ChevronRight size={14} />
        </Link>
      </div>
      {!items || items.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-card border border-border rounded-xl p-4 flex items-center gap-2">
          <CalendarClock size={16} className="text-muted-foreground/70" />
          {t('home.nothingDue')}
        </p>
      ) : (
        <ul className="flex gap-2.5 overflow-x-auto -mx-6 px-6 pb-1 snap-x">
          {items.map((item) => {
            const days = daysUntil(item.date)
            const soon = days <= 3
            return (
              <li
                key={`${item.kind}-${item.id}-${item.date}`}
                className="snap-start shrink-0 w-[150px] rounded-xl border border-border bg-card p-3"
              >
                <p className="text-xs font-medium truncate">{item.name}</p>
                <p className="mt-1 text-base font-semibold tabular-nums">
                  {mask(formatCurrency(Number(item.amount), item.currency, locale))}
                </p>
                <p className={cn('text-[11px] mt-0.5', soon ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                  {days === 0
                    ? t('subscriptions.dueToday')
                    : days === 1
                      ? t('home.dueTomorrow')
                      : formatShortDate(item.date, dateLocale)}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
