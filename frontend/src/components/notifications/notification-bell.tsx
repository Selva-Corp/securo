import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { notifications as notificationsApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { NotificationsPanel } from '@/components/notifications/notifications-panel'

interface NotificationBellProps {
  /** Icon size in px; matches the neighbouring header icons. */
  size?: number
  className?: string
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  })
}

/**
 * Bell with an unread badge. Owns its slide-over so the layout only has to
 * drop the component in; the two instances (mobile header, sidebar) are never
 * visible at the same time.
 */
export function NotificationBell({ size = 18, className }: NotificationBellProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data } = useUnreadCount()
  const count = data?.count ?? 0
  const label = count > 0 ? t('notifications.bellUnread', { count }) : t('notifications.title')

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('relative transition-colors p-1', className)}
        title={label}
        aria-label={label}
      >
        <Bell size={size} />
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 font-semibold text-center tabular-nums"
            aria-hidden="true"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      <NotificationsPanel open={open} onOpenChange={setOpen} />
    </>
  )
}
