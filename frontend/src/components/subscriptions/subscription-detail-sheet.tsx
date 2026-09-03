import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Ban, Check, EyeOff, Pencil, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { MerchantAvatar } from '@/components/subscriptions/merchant-avatar'
import { formatShortDate, type SubscriptionAction } from '@/components/subscriptions/subscription-card'
import { subscriptions as subscriptionsApi } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { SUBSCRIPTION_CADENCES, cadenceLabelKey } from '@/lib/subscription-utils'
import { cn } from '@/lib/utils'
import type { Subscription, SubscriptionUpdate } from '@/types'

interface SubscriptionDetailSheetProps {
  subscription: Subscription | null
  open: boolean
  onOpenChange: (open: boolean) => void
  locale: string
  dateLocale: string
  mask: (value: string) => string
  canWrite: boolean
  busy: boolean
  onAction: (subscription: Subscription, action: SubscriptionAction) => void
  onSave: (subscription: Subscription, update: SubscriptionUpdate) => Promise<unknown>
}

const selectClass =
  'w-full border border-border rounded-md px-3 py-2 text-sm bg-card focus:outline-none focus-visible:ring-ring/30 focus-visible:ring-[2px]'

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground truncate tabular-nums">{value}</p>
    </div>
  )
}

export function SubscriptionDetailSheet({
  subscription: sub,
  open,
  onOpenChange,
  locale,
  dateLocale,
  mask,
  canWrite,
  busy,
  onAction,
  onSave,
}: SubscriptionDetailSheetProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)

  const { data: detail } = useQuery({
    queryKey: ['subscriptions', 'detail', sub?.id],
    queryFn: () => subscriptionsApi.get(sub!.id),
    enabled: open && Boolean(sub),
  })

  if (!sub) return null
  const current = detail ?? sub
  const charges = [...(detail?.charges ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const chartData = charges.map((c) => ({ date: formatShortDate(c.date, dateLocale), amount: Number(c.amount) }))

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setEditing(false)
        onOpenChange(next)
      }}
    >
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
            'fixed right-0 top-0 z-50 h-full w-full sm:w-[440px] md:w-[480px] bg-background border-l shadow-xl',
            'flex flex-col outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'duration-200',
          )}
        >
          <DialogPrimitive.Title className="sr-only">{t('subscriptions.detail.title')}</DialogPrimitive.Title>

          <header className="flex items-center gap-3 px-4 py-3 border-b shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <MerchantAvatar name={current.display_name} logoUrl={current.logo_url} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{current.display_name}</p>
              <p className="text-xs text-muted-foreground">
                {t(cadenceLabelKey(current.cadence))}
                <span aria-hidden="true"> · </span>
                {t(`subscriptions.tabs.${current.status}`)}
              </p>
            </div>
            {canWrite && !editing && (
              <Button size="icon-xs" variant="ghost" onClick={() => setEditing(true)} aria-label={t('subscriptions.actions.edit')}>
                <Pencil />
              </Button>
            )}
            <DialogPrimitive.Close asChild>
              <Button size="icon-xs" variant="ghost" aria-label={t('common.close')}>
                <X />
              </Button>
            </DialogPrimitive.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {editing ? (
              <EditForm
                key={sub.id}
                subscription={sub}
                busy={busy}
                onCancel={() => setEditing(false)}
                onSave={async (update) => {
                  if (Object.keys(update).length > 0) await onSave(sub, update)
                  setEditing(false)
                }}
              />
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Stat label={t('subscriptions.detail.amount')} value={mask(formatCurrency(Number(current.amount), current.currency, locale))} />
                <Stat
                  label={t('subscriptions.summary.monthly')}
                  value={mask(formatCurrency(Number(current.monthly_equivalent), current.currency, locale))}
                />
                <Stat label={t('subscriptions.detail.nextExpected')} value={formatShortDate(current.next_expected, dateLocale)} />
                <Stat label={t('subscriptions.lastCharge')} value={formatShortDate(current.last_seen, dateLocale)} />
                <Stat label={t('subscriptions.firstSeen')} value={formatShortDate(current.first_seen, dateLocale)} />
                <Stat label={t('subscriptions.occurrences', { count: current.occurrence_count })} value={`${Math.round(Number(current.confidence) * 100)}% ${t('subscriptions.confidence')}`} />
              </div>
            )}

            {current.price_history.length > 1 && (
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {t('subscriptions.detail.priceHistory')}
                </h3>
                <ol className="space-y-1">
                  {[...current.price_history].reverse().map((point, i) => (
                    <li key={`${point.date}-${i}`} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{formatShortDate(point.date, dateLocale)}</span>
                      <span className="tabular-nums">{mask(formatCurrency(Number(point.amount), current.currency, locale))}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t('subscriptions.detail.charges')}
              </h3>
              {!detail ? (
                <Skeleton className="h-24 rounded-lg" />
              ) : (
                <>
                  {chartData.length > 1 && (
                    <div className="h-24 -mx-1 mb-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                          <defs>
                            <linearGradient id="subscription-area" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" hide />
                          <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                          <Tooltip
                            formatter={(value) => mask(formatCurrency(Number(value), current.currency, locale))}
                            contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          />
                          <Area type="linear" dataKey="amount" stroke="var(--primary)" fill="url(#subscription-area)" strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {[...charges].reverse().map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate">{c.description}</p>
                          <p className="text-xs text-muted-foreground">{formatShortDate(c.date, dateLocale)}</p>
                        </div>
                        <span className="tabular-nums shrink-0">{mask(formatCurrency(Number(c.amount), c.currency, locale))}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>

          {canWrite && !editing && (
            <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {current.status === 'suggested' && (
                <>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => onAction(current, 'ignore')}>
                    <EyeOff />
                    {t('subscriptions.actions.ignore')}
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => onAction(current, 'track')}>
                    <Check />
                    {t('subscriptions.actions.track')}
                  </Button>
                </>
              )}
              {current.status === 'tracked' && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onAction(current, 'cancel')}>
                  <Ban />
                  {t('subscriptions.actions.cancel')}
                </Button>
              )}
              {(current.status === 'cancelled' || current.status === 'ignored') && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onAction(current, 'restore')}>
                  <RotateCcw />
                  {t('subscriptions.actions.restore')}
                </Button>
              )}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

interface EditFormProps {
  subscription: Subscription
  busy: boolean
  onCancel: () => void
  onSave: (update: SubscriptionUpdate) => Promise<void>
}

/** Keyed by subscription id from the parent, so each subscription gets fresh state. */
function EditForm({ subscription: sub, busy, onCancel, onSave }: EditFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(sub.display_name)
  const [amount, setAmount] = useState(String(sub.amount))
  const [cadence, setCadence] = useState<string>(sub.cadence)

  const handleSave = () => {
    const update: SubscriptionUpdate = {}
    if (name.trim() && name.trim() !== sub.display_name) update.display_name = name.trim()
    if (amount && Number(amount) !== Number(sub.amount)) update.amount = Number(amount)
    if (cadence !== sub.cadence) update.cadence = cadence as SubscriptionUpdate['cadence']
    return onSave(update)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t('subscriptions.form.name')}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t('subscriptions.form.amount')}</Label>
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t('subscriptions.form.cadence')}</Label>
          <select className={selectClass} value={cadence} onChange={(e) => setCadence(e.target.value)}>
            {SUBSCRIPTION_CADENCES.map((c) => (
              <option key={c} value={c}>
                {t(cadenceLabelKey(c))}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" disabled={busy} onClick={handleSave}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
