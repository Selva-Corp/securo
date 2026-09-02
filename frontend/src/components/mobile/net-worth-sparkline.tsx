import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BalanceHistory, DashboardSummary } from '@/types'

interface NetWorthSparklineProps {
  summary: DashboardSummary | undefined
  history: BalanceHistory | undefined
  locale: string
  mask: (value: string) => string
}

export function NetWorthSparkline({ summary, history, locale, mask }: NetWorthSparklineProps) {
  const { t } = useTranslation()
  if (!summary) return <Skeleton className="h-28 rounded-xl" />

  const currency = summary.primary_currency
  const netWorth = summary.total_balance_primary + (summary.assets_value_primary ?? 0)
  const points = (history?.current ?? []).filter((p) => p.balance != null).map((p) => ({ day: p.day, balance: p.balance as number }))
  const first = points[0]?.balance
  const last = points[points.length - 1]?.balance
  const delta = first != null && last != null ? last - first : null

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{t('home.netWorth')}</p>
          <p className="text-2xl font-semibold tabular-nums truncate">{mask(formatCurrency(netWorth, currency, locale))}</p>
          {delta != null && (
            <p className={cn('text-xs tabular-nums', delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
              {delta >= 0 ? '+' : ''}
              {mask(formatCurrency(delta, currency, locale))} {t('home.thisMonth')}
            </p>
          )}
        </div>
        <Link to="/reports" className="text-xs text-primary font-medium flex items-center gap-0.5 shrink-0">
          {t('common.view')}
          <ChevronRight size={14} />
        </Link>
      </div>
      {points.length > 1 && (
        <div className="h-14 mt-2 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="home-net-worth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Area type="monotone" dataKey="balance" stroke="var(--primary)" strokeWidth={2} fill="url(#home-net-worth)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
