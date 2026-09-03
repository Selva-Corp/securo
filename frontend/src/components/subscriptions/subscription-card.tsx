import { useTranslation } from 'react-i18next'
import { AlertTriangle, Ban, Check, EyeOff, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MerchantAvatar } from '@/components/subscriptions/merchant-avatar'
import { cadenceLabelKey, daysUntil, priceTrend } from '@/lib/subscription-utils'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Subscription } from '@/types'

export type SubscriptionAction = 'track' | 'ignore' | 'cancel' | 'restore'

interface SubscriptionCardProps {
  subscription: Subscription
  locale: string
  dateLocale: string
  mask: (value: string) => string
  canWrite: boolean
  busy?: boolean
  onOpen: (subscription: Subscription) => void
  onAction: (subscription: Subscription, action: SubscriptionAction) => void
}

export function formatShortDate(iso: string, dateLocale: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })
}

export function SubscriptionCard({
  subscription: sub,
  locale,
  dateLocale,
  mask,
  canWrite,
  busy,
  onOpen,
  onAction,
}: SubscriptionCardProps) {
  const { t } = useTranslation()
  const trend = priceTrend(sub.price_history)
  const days = daysUntil(sub.next_expected)
  const isActive = sub.status === 'tracked' || sub.status === 'suggested'

  let dueLabel: string
  if (sub.status === 'cancelled' && sub.cancelled_at) {
    dueLabel = t('subscriptions.cancelledOn', { date: formatShortDate(sub.cancelled_at, dateLocale) })
  } else if (sub.is_lapsed) {
    dueLabel = t('subscriptions.lapsed')
  } else if (days === 0) {
    dueLabel = t('subscriptions.dueToday')
  } else if (days > 0) {
    dueLabel = t('subscriptions.nextIn', { count: days })
  } else {
    dueLabel = t('subscriptions.overdue', { date: formatShortDate(sub.next_expected, dateLocale) })
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(sub)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(sub)
        }
      }}
      className={cn(
        'bg-card rounded-xl border border-border shadow-sm p-4 flex gap-3 cursor-pointer',
        'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring/30 transition-colors',
        !isActive && 'opacity-80',
      )}
    >
      <MerchantAvatar name={sub.display_name} logoUrl={sub.logo_url} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{sub.display_name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {t(cadenceLabelKey(sub.cadence))}
              <span aria-hidden="true"> · </span>
              {dueLabel}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-semibold tabular-nums text-foreground">
              {mask(formatCurrency(Number(sub.amount), sub.currency, locale))}
            </p>
            {sub.cadence !== 'monthly' && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {t('subscriptions.perMonth', {
                  amount: mask(formatCurrency(Number(sub.monthly_equivalent), sub.currency, locale)),
                })}
              </p>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {trend === 'up' && (
            <Badge variant="destructive" className="gap-1">
              <TrendingUp className="size-3" />
              {t('subscriptions.priceUp')}
            </Badge>
          )}
          {trend === 'down' && (
            <Badge variant="secondary" className="gap-1">
              <TrendingDown className="size-3" />
              {t('subscriptions.priceDown')}
            </Badge>
          )}
          {sub.is_lapsed && isActive && (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <AlertTriangle className="size-3" />
              {t('subscriptions.lapsed')}
            </Badge>
          )}

          {canWrite && (
            <div className="ml-auto flex items-center gap-1" onClick={stop}>
              {sub.status === 'suggested' && (
                <>
                  <Button size="xs" variant="ghost" disabled={busy} onClick={() => onAction(sub, 'ignore')}>
                    <EyeOff />
                    {t('subscriptions.actions.ignore')}
                  </Button>
                  <Button size="xs" disabled={busy} onClick={() => onAction(sub, 'track')}>
                    <Check />
                    {t('subscriptions.actions.track')}
                  </Button>
                </>
              )}
              {sub.status === 'tracked' && (
                <Button size="xs" variant="outline" disabled={busy} onClick={() => onAction(sub, 'cancel')}>
                  <Ban />
                  {t('subscriptions.actions.cancel')}
                </Button>
              )}
              {(sub.status === 'cancelled' || sub.status === 'ignored') && (
                <Button size="xs" variant="outline" disabled={busy} onClick={() => onAction(sub, 'restore')}>
                  <RotateCcw />
                  {t('subscriptions.actions.restore')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
