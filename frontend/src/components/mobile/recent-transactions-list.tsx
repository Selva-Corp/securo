import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { MobileTransactionRow } from '@/components/mobile-transaction-row'
import { Skeleton } from '@/components/ui/skeleton'
import type { Account, Transaction } from '@/types'

interface RecentTransactionsListProps {
  transactions: Transaction[] | undefined
  accounts: Account[] | undefined
  locale: string
  userCurrency: string
  canWrite: boolean
}

export function RecentTransactionsList({ transactions, accounts, locale, userCurrency, canWrite }: RecentTransactionsListProps) {
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
          <div className="divide-y divide-border">
            {transactions.map((tx) => (
              <MobileTransactionRow
                key={tx.id}
                tx={tx}
                account={tx.account_id ? accountById.get(tx.account_id) : undefined}
                groupName={undefined}
                selected={false}
                selectable={false}
                canWrite={canWrite}
                highlighted={false}
                locale={locale}
                userCurrency={userCurrency}
                onSelect={() => {}}
                onClick={(row) => navigate(`/transactions?highlight=${row.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
