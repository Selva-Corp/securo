import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { BellOff, CheckCheck, Settings2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NotificationRow } from '@/components/notifications/notification-row'
import { useNotificationActions } from '@/components/notifications/use-notification-actions'
import { notifications as notificationsApi } from '@/lib/api'
import { notificationPath } from '@/lib/notification-utils'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types'

interface NotificationsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NotificationsPanel({ open, onOpenChange }: NotificationsPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { markRead, markAllRead } = useNotificationActions()
  const { data: rows, isLoading } = useQuery({
    queryKey: ['notifications', 'list', 'recent'],
    queryFn: () => notificationsApi.list({ limit: 30 }),
    enabled: open,
  })
  const unread = (rows ?? []).filter((n) => !n.read_at).length

  const openNotification = (n: Notification) => {
    if (!n.read_at) markRead.mutate(n.id)
    onOpenChange(false)
    navigate(notificationPath(n))
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 backdrop-blur-[3px] bg-background/40',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed right-0 top-0 z-50 h-full w-full sm:w-[420px] bg-background border-l shadow-xl',
            'flex flex-col outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'duration-200',
          )}
        >
          <header className="flex items-center gap-2 px-4 py-3 border-b shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <DialogPrimitive.Title className="font-semibold flex-1 min-w-0 truncate">
              {t('notifications.title')}
            </DialogPrimitive.Title>
            {unread > 0 && (
              <Button size="xs" variant="ghost" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
                <CheckCheck />
                {t('notifications.markAllRead')}
              </Button>
            )}
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={t('notifications.preferences.title')}
              onClick={() => {
                onOpenChange(false)
                navigate('/notifications')
              }}
            >
              <Settings2 />
            </Button>
            <DialogPrimitive.Close asChild>
              <Button size="icon-xs" variant="ghost" aria-label={t('common.close')}>
                <X />
              </Button>
            </DialogPrimitive.Close>
          </header>

          <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : !rows || rows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <BellOff className="mx-auto size-8 opacity-60" />
                <p className="mt-3 text-sm">{t('notifications.empty')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((n) => (
                  <li key={n.id}>
                    <NotificationRow notification={n} onOpen={openNotification} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="border-t px-4 py-2 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onOpenChange(false)
                navigate('/notifications')
              }}
            >
              {t('notifications.viewAll')}
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
