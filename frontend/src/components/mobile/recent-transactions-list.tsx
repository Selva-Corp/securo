import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { CategoryIcon } from '@/components/category-icon'
import { Skeleton } from '@/components/ui/skeleton'
import { formatShortDate } from '@/components/subscriptions/subscription-card'
import { getAccountName } from '@/lib/account-utils'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Account, Transaction } from '@/types'

interface RecentTransactionsListProps {
  transactions: Transaction[] | undefined
  accounts: Account[] | undefined
  locale: string
  dateLocale: string
  mask: (value: string) => string
}

/**
 * One line per transaction. Bank descriptions ("ORIG CO NAME:… ENTRY DESCR:…")
 * run long, so the row truncates instead of wrapping like the full list does.
 */
export function RecentTransactionsList({ transactions, accounts, locale, dateLocale, mask }: RecentTransactionsListProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]))

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">{t('home.recent')}</h2>
        <Link to="/transactions" className="text-xs text-primary font-medium flex items-center gap-0.5">
          {t('common.view')}
          <ChevronRight size={14} />
        </Link>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {!transactions ? (
          <div className="p-3 space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t('home.noTransactions')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {transactions.map((tx) => {
              const account = tx.account_id ? accountById.get(tx.account_id) : undefined
              const debit = tx.type === 'debit'
              return (
                <li key={tx.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/transactions?highlight=${tx.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
                  >
                    <CategoryIcon icon={tx.category?.icon} color={tx.category?.color} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm truncate">{tx.payee || tx.description}</span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {formatShortDate(tx.date, dateLocale)}
                        {account ? ` · ${getAccountName(account)}` : ''}
                      </span>
                    </span>
                    <span className={cn('text-sm font-medium tabular-nums shrink-0', debit ? 'text-foreground' : 'text-emerald-600 dark:text-emerald-400')}>
                      {debit ? '−' : '+'}
                      {mask(formatCurrency(Number(tx.amount), tx.currency, locale))}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
