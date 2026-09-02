import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { ArrowLeftRight, CreditCard, Home, Menu, PiggyBank, type LucideIcon } from 'lucide-react'
import { useWorkspace } from '@/contexts/workspace-context'
import type { ModuleId } from '@/lib/modules'
import { cn } from '@/lib/utils'

interface Tab {
  key: string
  path: string
  icon: LucideIcon
  module?: ModuleId
}

const TABS: Tab[] = [
  { key: 'home', path: '/', icon: Home },
  { key: 'transactions', path: '/transactions', icon: ArrowLeftRight, module: 'transactions' },
  { key: 'subscriptions', path: '/subscriptions', icon: CreditCard, module: 'subscriptions' },
  { key: 'budgets', path: '/budgets', icon: PiggyBank, module: 'budgets' },
]

interface BottomTabBarProps {
  /** Opens the full sidebar for everything that is not a tab. */
  onMore: () => void
}

/**
 * Phone navigation (fork feature). Fixed to the bottom, below `md` only —
 * the same breakpoint as `useIsMobile`, so it appears exactly when the home
 * route swaps to the mobile layout. Sits inside the iOS home-indicator safe
 * area via `env(safe-area-inset-bottom)`.
 */
export function BottomTabBar({ onMore }: BottomTabBarProps) {
  const { t } = useTranslation()
  const { hasModule } = useWorkspace()
  const tabs = TABS.filter((tab) => !tab.module || hasModule(tab.module))

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-sidebar/95 backdrop-blur border-t border-sidebar-border pb-[env(safe-area-inset-bottom)]"
      aria-label={t('home.tabs.aria')}
    >
      <ul className="flex items-stretch h-14">
        {tabs.map((tab) => (
          <li key={tab.key} className="flex-1 min-w-0">
            <NavLink
              to={tab.path}
              end={tab.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-sidebar-muted hover:text-sidebar-foreground',
                )
              }
            >
              <tab.icon size={20} />
              <span className="truncate max-w-full px-1">{t(`home.tabs.${tab.key}`)}</span>
            </NavLink>
          </li>
        ))}
        <li className="flex-1 min-w-0">
          <button
            type="button"
            onClick={onMore}
            className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium text-sidebar-muted hover:text-sidebar-foreground transition-colors"
          >
            <Menu size={20} />
            <span>{t('home.tabs.more')}</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
