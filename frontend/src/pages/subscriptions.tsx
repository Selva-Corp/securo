import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { SummaryHeader } from '@/components/subscriptions/summary-header'
import { SubscriptionCard, type SubscriptionAction } from '@/components/subscriptions/subscription-card'
import { SubscriptionDetailSheet } from '@/components/subscriptions/subscription-detail-sheet'
import { subscriptions as subscriptionsApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { localDateString } from '@/lib/date-utils'
import { invalidateFinancialQueries } from '@/lib/invalidate-queries'
import type { SubscriptionStatus } from '@/lib/subscription-utils'
import { useDateLocale, useDisplayLocale } from '@/hooks/use-display-locale'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { useWorkspace } from '@/contexts/workspace-context'
import type { Subscription, SubscriptionUpdate } from '@/types'

const TABS: SubscriptionStatus[] = ['suggested', 'tracked', 'cancelled', 'ignored']

export default function SubscriptionsPage() {
  const { t } = useTranslation()
  const locale = useDisplayLocale()
  const dateLocale = useDateLocale()
  const { mask } = usePrivacyMode()
  const { canWrite } = useWorkspace()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<SubscriptionStatus | null>(null)
  const [selected, setSelected] = useState<Subscription | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null)
  const [cancelDate, setCancelDate] = useState(localDateString())

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['subscriptions', 'list'],
    queryFn: () => subscriptionsApi.list(),
  })
  const { data: summary } = useQuery({
    queryKey: ['subscriptions', 'summary'],
    queryFn: subscriptionsApi.summary,
  })

  const counts = useMemo(() => {
    const c: Record<SubscriptionStatus, number> = { suggested: 0, tracked: 0, cancelled: 0, ignored: 0 }
    for (const row of rows) c[row.status] += 1
    return c
  }, [rows])
  const activeTab: SubscriptionStatus = tab ?? (counts.suggested > 0 || counts.tracked === 0 ? 'suggested' : 'tracked')
  const visible = useMemo(() => rows.filter((row) => row.status === activeTab), [rows, activeTab])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    queryClient.invalidateQueries({ queryKey: ['recurring'] })
    queryClient.invalidateQueries({ queryKey: ['recurring-transactions'] })
    invalidateFinancialQueries(queryClient)
  }

  const scan = useMutation({
    mutationFn: subscriptionsApi.scan,
    onSuccess: (result) => {
      toast.success(t('subscriptions.scanDone', { created: result.created, updated: result.updated }))
      invalidate()
    },
    onError: (error) => toast.error(extractApiError(error) || t('subscriptions.toasts.scanFailed')),
  })

  const act = useMutation({
    mutationFn: async ({ sub, action, cancelledAt }: { sub: Subscription; action: SubscriptionAction; cancelledAt?: string }) => {
      switch (action) {
        case 'track':
          return subscriptionsApi.track(sub.id)
        case 'ignore':
          return subscriptionsApi.ignore(sub.id)
        case 'cancel':
          return subscriptionsApi.cancel(sub.id, cancelledAt)
        case 'restore':
          return subscriptionsApi.restore(sub.id)
      }
    },
    onSuccess: (updated, variables) => {
      toast.success(t(`subscriptions.toasts.${variables.action}`))
      if (selected?.id === updated.id) setSelected(updated)
      invalidate()
    },
    onError: (error) => toast.error(extractApiError(error) || t('common.error')),
  })

  const save = useMutation({
    mutationFn: ({ sub, update }: { sub: Subscription; update: SubscriptionUpdate }) => subscriptionsApi.update(sub.id, update),
    onSuccess: (updated) => {
      toast.success(t('subscriptions.toasts.updated'))
      setSelected(updated)
      invalidate()
    },
    onError: (error) => toast.error(extractApiError(error) || t('common.error')),
  })

  const handleAction = (sub: Subscription, action: SubscriptionAction) => {
    if (action === 'cancel') {
      setCancelDate(localDateString())
      setCancelTarget(sub)
      return
    }
    act.mutate({ sub, action })
  }

  const openDetail = (sub: Subscription) => {
    setSelected(sub)
    setSheetOpen(true)
  }

  const busy = act.isPending || save.isPending
  const scanButton = canWrite ? (
    <Button variant="outline" size="sm" disabled={scan.isPending} onClick={() => scan.mutate()}>
      <RefreshCw className={scan.isPending ? 'animate-spin' : undefined} />
      {scan.isPending ? t('subscriptions.scanning') : t('subscriptions.scanNow')}
    </Button>
  ) : undefined

  return (
    <div>
      <PageHeader section={t('nav.groupSetup')} title={t('subscriptions.title')} action={scanButton} />
      <SummaryHeader summary={summary} locale={locale} mask={mask} />

      <Tabs value={activeTab} onValueChange={(value) => setTab(value as SubscriptionStatus)} className="mb-4">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          {TABS.map((status) => (
            <TabsTrigger key={status} value={status} className="flex-1 sm:flex-none">
              {t(`subscriptions.tabs.${status}`)}
              {counts[status] > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {counts[status]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed border-border p-8 text-center">
          <Sparkles className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 font-medium text-foreground">{t('subscriptions.empty.title')}</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">{t('subscriptions.empty.body')}</p>
          {scanButton && <div className="mt-4 flex justify-center">{scanButton}</div>}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{t(`subscriptions.empty.${activeTab}`)}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((sub) => (
            <SubscriptionCard
              key={sub.id}
              subscription={sub}
              locale={locale}
              dateLocale={dateLocale}
              mask={mask}
              canWrite={canWrite}
              busy={busy}
              onOpen={openDetail}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {activeTab === 'tracked' && visible.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">{t('subscriptions.trackedHint')}</p>
      )}

      <SubscriptionDetailSheet
        subscription={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        locale={locale}
        dateLocale={dateLocale}
        mask={mask}
        canWrite={canWrite}
        busy={busy}
        onAction={handleAction}
        onSave={(sub, update) => save.mutateAsync({ sub, update })}
      />

      <Dialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('subscriptions.cancelDialog.title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('subscriptions.cancelDialog.body')}</p>
          <div className="space-y-2">
            <Label>{t('subscriptions.cancelDialog.date')}</Label>
            <DatePickerInput value={cancelDate} onChange={setCancelDate} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy || !cancelTarget}
              onClick={() => {
                if (!cancelTarget) return
                act.mutate({ sub: cancelTarget, action: 'cancel', cancelledAt: cancelDate })
                setCancelTarget(null)
              }}
            >
              {t('subscriptions.cancelDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
