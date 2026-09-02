import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/hooks/use-display-locale'
import { NotificationKindIcon } from '@/components/notifications/notification-kind-icon'
import { relativeTime } from '@/lib/notification-utils'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types'

interface NotificationRowProps {
  notification: Notification
  onOpen: (notification: Notification) => void
}

export function NotificationRow({ notification: n, onOpen }: NotificationRowProps) {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const unread = !n.read_at

  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn(
        'w-full text-left flex gap-3 px-4 py-3 hover:bg-accent/50 transition-colors',
        unread && 'bg-primary/5',
      )}
    >
      <span
        className={cn(
          'mt-0.5 size-8 shrink-0 rounded-full flex items-center justify-center [&_svg]:size-4',
          unread ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden="true"
      >
        <NotificationKindIcon kind={n.kind} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn('text-sm truncate', unread ? 'font-semibold text-foreground' : 'text-foreground')}>
            {n.title}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {relativeTime(n.created_at, dateLocale, t)}
          </span>
        </span>
        <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</span>
      </span>
      {unread && <span className="mt-2 size-2 rounded-full bg-primary shrink-0" aria-hidden="true" />}
    </button>
  )
}
