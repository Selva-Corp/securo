import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CreditCard, PiggyBank, Plus, Upload, type LucideIcon } from 'lucide-react'
import { useWorkspace } from '@/contexts/workspace-context'
import type { ModuleId } from '@/lib/modules'

interface Action {
  key: string
  to: string
  icon: LucideIcon
  module?: ModuleId
  primary?: boolean
}

const ACTIONS: Action[] = [
  { key: 'add', to: '/transactions?new=1', icon: Plus, module: 'transactions', primary: true },
  { key: 'import', to: '/import', icon: Upload, module: 'import' },
  { key: 'subscriptions', to: '/subscriptions', icon: CreditCard, module: 'subscriptions' },
  { key: 'budgets', to: '/budgets', icon: PiggyBank, module: 'budgets' },
]

export function QuickActions() {
  const { t } = useTranslation()
  const { hasModule, canWrite } = useWorkspace()
  const actions = ACTIONS.filter((a) => (!a.module || hasModule(a.module)) && (a.key !== 'add' || canWrite))
  if (actions.length === 0) return null

  return (
    <ul className="grid grid-cols-4 gap-2">
      {actions.map((action) => (
        <li key={action.key}>
          <Link
            to={action.to}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-1 py-3 text-[11px] font-medium hover:bg-accent/50 transition-colors"
          >
            <span
              className={
                action.primary
                  ? 'size-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center'
                  : 'size-9 rounded-full bg-muted text-foreground flex items-center justify-center'
              }
            >
              <action.icon size={18} />
            </span>
            <span className="truncate max-w-full">{t(`home.actions.${action.key}`)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
