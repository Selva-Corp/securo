import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  accounts as accountsApi,
  budgets as budgetsApi,
  dashboard as dashboardApi,
  transactions as transactionsApi,
} from '@/lib/api'
import { greetingKey } from '@/lib/safe-to-spend'
import { useAuth } from '@/contexts/auth-context'
import { useWorkspace } from '@/contexts/workspace-context'
import { useDateLocale, useDisplayLocale } from '@/hooks/use-display-locale'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { SafeToSpendCard } from '@/components/mobile/safe-to-spend-card'
import { UpcomingBillsStrip } from '@/components/mobile/upcoming-bills-strip'
import { QuickActions } from '@/components/mobile/quick-actions'
import { BudgetRings } from '@/components/mobile/budget-rings'
import { RecentTransactionsList } from '@/components/mobile/recent-transactions-list'
import { NetWorthSparkline } from '@/components/mobile/net-worth-sparkline'

/**
 * Phone home screen (fork feature). Rendered for `/` below the `md`
 * breakpoint instead of the desktop dashboard; see `home-route.tsx`.
 */
export default function MobileHomePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { hasModule, canWrite, current } = useWorkspace()
  const locale = useDisplayLocale()
  const dateLocale = useDateLocale()
  const { mask } = usePrivacyMode()
  const userCurrency = user?.preferences?.currency_display ?? 'USD'

  const { data: mobile } = useQuery({
    queryKey: ['dashboard', 'mobile-summary'],
    queryFn: dashboardApi.mobileSummary,
  })
  const { data: summary } = useQuery({
    queryKey: ['dashboard', 'summary', 'home'],
    queryFn: () => dashboardApi.summary(),
  })
  const { data: history } = useQuery({
    queryKey: ['dashboard', 'balance-history', 'home'],
    queryFn: () => dashboardApi.balanceHistory(),
  })
  const { data: budgetRows } = useQuery({
    queryKey: ['budgets', 'comparison', 'home'],
    queryFn: () => budgetsApi.comparison(),
    enabled: hasModule('budgets'),
  })
  const { data: recent } = useQuery({
    queryKey: ['transactions', 'home-recent'],
    queryFn: () =>
      transactionsApi.list({ limit: 6, page: 1, sort_by: 'date', sort_dir: 'desc', include_opening_balance: false }),
  })
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => accountsApi.list() })

  const name = current?.name
  const hour = new Date().getHours()

  return (
    <div className="space-y-5 -mt-2">
      <header>
        <p className="text-sm text-muted-foreground">{t(greetingKey(hour))}</p>
        {name && <h1 className="text-xl font-semibold truncate">{name}</h1>}
      </header>

      <SafeToSpendCard summary={mobile} locale={locale} mask={mask} />
      <QuickActions />
      <UpcomingBillsStrip items={mobile?.upcoming} locale={locale} dateLocale={dateLocale} mask={mask} />
      {hasModule('budgets') && (
        <BudgetRings rows={budgetRows} currency={mobile?.primary_currency ?? userCurrency} locale={locale} mask={mask} />
      )}
      <RecentTransactionsList
        transactions={recent?.items}
        accounts={accounts}
        locale={locale}
        userCurrency={userCurrency}
        canWrite={canWrite}
      />
      <NetWorthSparkline summary={summary} history={history} locale={locale} mask={mask} />
    </div>
  )
}
