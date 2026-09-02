import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BellOff, CheckCheck, Send } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { NotificationRow } from '@/components/notifications/notification-row'
import { useNotificationActions } from '@/components/notifications/use-notification-actions'
import { notifications as notificationsApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { NOTIFICATION_KINDS, notificationPath } from '@/lib/notification-utils'
import type { Notification, NotificationPreferences, NotificationPreferencesUpdate } from '@/types'

const PAGE = 50

export default function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { markRead, markAllRead } = useNotificationActions()
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['notifications', 'list', 'pages'],
    queryFn: ({ pageParam }) => notificationsApi.list({ limit: PAGE, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].created_at : undefined),
  })

  const rows = data?.pages.flat() ?? []
  const unread = rows.filter((n) => !n.read_at).length

  const open = (n: Notification) => {
    if (!n.read_at) markRead.mutate(n.id)
    navigate(notificationPath(n))
  }

  return (
    <div>
      <PageHeader
        section={t('nav.groupSetup')}
        title={t('notifications.title')}
        action={
          unread > 0 ? (
            <Button variant="outline" size="sm" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
              <CheckCheck />
              {t('notifications.markAllRead')}
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
        <section className="rounded-xl border bg-card overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              <BellOff className="mx-auto size-8 opacity-60" />
              <p className="mt-3 text-sm">{t('notifications.empty')}</p>
              <p className="mt-1 text-xs">{t('notifications.emptyHint')}</p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {rows.map((n) => (
                  <li key={n.id}>
                    <NotificationRow notification={n} onOpen={open} />
                  </li>
                ))}
              </ul>
              {hasNextPage && (
                <div className="p-3 border-t">
                  <Button variant="ghost" size="sm" className="w-full" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
                    {t('common.showMore')}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        <PreferencesCard />
      </div>
    </div>
  )
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min = 0,
  step = 1,
}: {
  label: string
  hint?: string
  value: number | string
  onChange: (value: string) => void
  min?: number
  step?: number
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" min={min} step={step} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function PreferencesCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: prefs, isLoading } = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: notificationsApi.getPreferences,
  })

  const save = useMutation({
    mutationFn: (update: NotificationPreferencesUpdate) => notificationsApi.updatePreferences(update),
    onSuccess: (updated) => {
      queryClient.setQueryData(['notifications', 'preferences'], updated)
      toast.success(t('notifications.preferences.saved'))
    },
    onError: (error) => toast.error(extractApiError(error) || t('common.error')),
  })
  const test = useMutation({
    mutationFn: notificationsApi.sendTest,
    onSuccess: (result) => {
      if (result.ok) toast.success(t('notifications.preferences.testSent'))
      else toast.error(t('notifications.preferences.testFailed', { error: result.error ?? '' }))
    },
    onError: (error) => toast.error(extractApiError(error) || t('common.error')),
  })

  if (isLoading || !prefs) {
    return <Skeleton className="h-[420px] rounded-xl" />
  }

  return (
    <section className="space-y-6 rounded-xl border bg-card p-5 sm:p-6">
      <div>
        <h2 className="font-semibold">{t('notifications.preferences.title')}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{t('notifications.preferences.subtitle')}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('notifications.preferences.kinds')}
        </p>
        <ul className="divide-y divide-border rounded-lg border">
          {NOTIFICATION_KINDS.map((kind) => {
            const enabled = prefs.kinds?.[kind] ?? true
            return (
              <li key={kind} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm">{t(`notifications.kinds.${kind}.label`)}</p>
                  <p className="text-xs text-muted-foreground">{t(`notifications.kinds.${kind}.description`)}</p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => save.mutate({ kinds: { ...(prefs.kinds ?? {}), [kind]: checked } })}
                />
              </li>
            )
          })}
        </ul>
      </div>

      <ThresholdsForm prefs={prefs} busy={save.isPending} onSave={(u) => save.mutate(u)} />

      <NtfyForm prefs={prefs} busy={save.isPending || test.isPending} onSave={(u) => save.mutate(u)} onTest={() => test.mutate()} />
    </section>
  )
}

function ThresholdsForm({
  prefs,
  busy,
  onSave,
}: {
  prefs: NotificationPreferences
  busy: boolean
  onSave: (update: NotificationPreferencesUpdate) => void
}) {
  const { t } = useTranslation()
  const [large, setLarge] = useState(String(prefs.large_transaction_amount))
  const [low, setLow] = useState(String(prefs.low_balance_amount))
  const [days, setDays] = useState(String(prefs.reminder_days_before))
  const [pct, setPct] = useState(String(prefs.unusual_spend_pct))
  const [hour, setHour] = useState(String(prefs.daily_digest_hour))

  const dirty =
    Number(large) !== Number(prefs.large_transaction_amount) ||
    Number(low) !== Number(prefs.low_balance_amount) ||
    Number(days) !== prefs.reminder_days_before ||
    Number(pct) !== prefs.unusual_spend_pct ||
    Number(hour) !== prefs.daily_digest_hour

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('notifications.preferences.thresholds')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={t('notifications.preferences.largeTransaction')} value={large} onChange={setLarge} step={10} />
        <NumberField label={t('notifications.preferences.lowBalance')} value={low} onChange={setLow} step={10} />
        <NumberField label={t('notifications.preferences.reminderDays')} value={days} onChange={setDays} />
        <NumberField label={t('notifications.preferences.unusualPct')} value={pct} onChange={setPct} step={5} />
        <NumberField
          label={t('notifications.preferences.digestHour')}
          hint={t('notifications.preferences.digestHourHint')}
          value={hour}
          onChange={setHour}
        />
      </div>
      {dirty && (
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              onSave({
                large_transaction_amount: Number(large),
                low_balance_amount: Number(low),
                reminder_days_before: Math.max(0, Math.min(30, Number(days))),
                unusual_spend_pct: Math.max(0, Number(pct)),
                daily_digest_hour: Math.max(0, Math.min(23, Number(hour))),
              })
            }
          >
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  )
}

function NtfyForm({
  prefs,
  busy,
  onSave,
  onTest,
}: {
  prefs: NotificationPreferences
  busy: boolean
  onSave: (update: NotificationPreferencesUpdate) => void
  onTest: () => void
}) {
  const { t } = useTranslation()
  const [server, setServer] = useState(prefs.ntfy_server_url)
  const [topic, setTopic] = useState(prefs.ntfy_topic ?? '')
  const [token, setToken] = useState('')

  const dirty = server !== prefs.ntfy_server_url || topic !== (prefs.ntfy_topic ?? '') || token !== ''

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('notifications.preferences.ntfy')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('notifications.preferences.ntfyHint')}</p>
        </div>
        <Switch checked={prefs.ntfy_enabled} onCheckedChange={(checked) => onSave({ ntfy_enabled: checked })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t('notifications.preferences.ntfyServer')}</Label>
          <Input value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://ntfy.sh" />
        </div>
        <div className="space-y-1.5">
          <Label>{t('notifications.preferences.ntfyTopic')}</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="securo-alerts-xyz" autoCapitalize="none" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t('notifications.preferences.ntfyToken')}</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={prefs.has_ntfy_token ? '••••••••' : t('notifications.preferences.ntfyTokenOptional')}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {prefs.has_ntfy_token && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onSave({ clear_ntfy_token: true })}>
            {t('notifications.preferences.ntfyClearToken')}
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy || !prefs.ntfy_enabled || !prefs.ntfy_topic} onClick={onTest}>
          <Send />
          {t('notifications.preferences.sendTest')}
        </Button>
        {dirty && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              onSave({ ntfy_server_url: server.trim() || 'https://ntfy.sh', ntfy_topic: topic.trim(), ...(token ? { ntfy_token: token } : {}) })
              setToken('')
            }}
          >
            {t('common.save')}
          </Button>
        )}
      </div>
    </div>
  )
}
