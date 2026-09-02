import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { notificationPath, relativeTime } from './notification-utils'

const t = ((key: string) => key) as unknown as TFunction

describe('notificationPath', () => {
  it('deep-links by kind and entity', () => {
    expect(notificationPath({ kind: 'budget_exceeded', payload: {}, entity_id: null })).toBe('/budgets')
    expect(notificationPath({ kind: 'large_transaction', payload: {}, entity_id: 'abc' })).toBe('/transactions?highlight=abc')
    expect(notificationPath({ kind: 'upcoming_bill', payload: { subscription_id: 'x' }, entity_id: null })).toBe('/subscriptions')
    expect(notificationPath({ kind: 'upcoming_bill', payload: {}, entity_id: null })).toBe('/recurring')
    expect(notificationPath({ kind: 'mystery', payload: {}, entity_id: null })).toBe('/notifications')
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-09-02T12:00:00Z')
  it('picks the right unit', () => {
    expect(relativeTime('2026-09-02T11:59:40Z', 'en', t, now)).toBe('notifications.justNow')
    expect(relativeTime('2026-09-02T11:30:00Z', 'en', t, now)).toBe('30 minutes ago')
    expect(relativeTime('2026-09-02T09:00:00Z', 'en', t, now)).toBe('3 hours ago')
    expect(relativeTime('2026-08-31T12:00:00Z', 'en', t, now)).toBe('2 days ago')
    expect(relativeTime('2026-08-01T12:00:00Z', 'en', t, now)).toBe('Aug 1')
  })
})
