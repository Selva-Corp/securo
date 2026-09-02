import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { CategoryIcon } from '@/components/category-icon'
import { budgetProgress } from '@/lib/safe-to-spend'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BudgetVsActual } from '@/types'

interface BudgetRingsProps {
  rows: BudgetVsActual[] | undefined
  currency: string
  locale: string
  mask: (value: string) => string
}

const R = 22
const CIRC = 2 * Math.PI * R

function Ring({ progress, color }: { progress: number; color: string }) {
  const over = progress >= 1
  return (
    <svg viewBox="0 0 56 56" className="size-14 -rotate-90" aria-hidden="true">
      <circle cx="28" cy="28" r={R} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted" />
      <circle
        cx="28"
        cy="28"
        r={R}
        fill="none"
        stroke={over ? 'var(--destructive)' : color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={CIRC * (1 - Math.min(progress, 1))}
      />
    </svg>
  )
}

/** Up to four budgets as progress rings, biggest budgets first. */
export function BudgetRings({ rows, currency, locale, mask }: BudgetRingsProps) {
  const { t } = useTranslation()
  const budgets = (rows ?? [])
    .filter((row) => row.budget_amount != null && row.budget_amount > 0)
    .sort((a, b) => (b.budget_amount ?? 0) - (a.budget_amount ?? 0))
    .slice(0, 4)

  if (budgets.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">{t('home.budgets')}</h2>
        <Link to="/budgets" className="text-xs text-primary font-medium flex items-center gap-0.5">
          {t('common.view')}
          <ChevronRight size={14} />
        </Link>
      </div>
      <ul className="grid grid-cols-4 gap-2">
        {budgets.map((row) => {
          const spent = Math.max(row.actual_amount, row.projected_amount ?? 0)
          const progress = budgetProgress(spent, row.budget_amount) ?? 0
          const left = (row.budget_amount ?? 0) - spent
          return (
            <li key={row.category_id} className="flex flex-col items-center text-center min-w-0">
              <div className="relative">
                <Ring progress={progress} color={row.category_color || 'var(--primary)'} />
                <span className="absolute inset-0 flex items-center justify-center text-muted-foreground [&_svg]:size-4">
                  <CategoryIcon icon={row.category_icon} color={row.category_color} size="sm" />
                </span>
              </div>
              <p className="mt-1 text-[11px] font-medium truncate max-w-full">{row.category_name}</p>
              <p className={cn('text-[10px] tabular-nums', left < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                {left < 0
                  ? t('home.over', { amount: mask(formatCurrency(-left, currency, locale)) })
                  : t('home.left', { amount: mask(formatCurrency(left, currency, locale)) })}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
