import { describe, expect, it } from 'vitest'
import {
  annualize,
  cadenceLabelKey,
  daysUntil,
  initials,
  monthlyEquivalent,
  monthlyTotalsByCurrency,
  priceTrend,
} from './subscription-utils'

describe('monthlyEquivalent / annualize', () => {
  it('scales each cadence to a month', () => {
    expect(monthlyEquivalent(12, 'yearly')).toBe(1)
    expect(monthlyEquivalent(10, 'weekly')).toBe(43.33)
    expect(monthlyEquivalent(50, 'biweekly')).toBe(108.33)
    expect(monthlyEquivalent(30, 'quarterly')).toBe(10)
    expect(monthlyEquivalent('15.99', 'monthly')).toBe(15.99)
  })

  it('treats unknown cadences as monthly and bad numbers as zero', () => {
    expect(monthlyEquivalent(9, 'daily')).toBe(9)
    expect(monthlyEquivalent('abc', 'monthly')).toBe(0)
  })

  it('annualizes from the monthly figure', () => {
    expect(annualize(15.99, 'monthly')).toBe(191.88)
    expect(annualize(120, 'yearly')).toBe(120)
  })
})

describe('cadenceLabelKey', () => {
  it('maps to the i18n namespace with a monthly fallback', () => {
    expect(cadenceLabelKey('biweekly')).toBe('subscriptions.cadence.biweekly')
    expect(cadenceLabelKey('bogus')).toBe('subscriptions.cadence.monthly')
  })
})

describe('priceTrend', () => {
  it('reads the last two price points', () => {
    expect(priceTrend([{ date: '2026-01-01', amount: '10' }])).toBeNull()
    expect(priceTrend([{ date: '2026-01-01', amount: '10' }, { date: '2026-05-01', amount: '12' }])).toBe('up')
    expect(priceTrend([{ date: '2026-01-01', amount: 12 }, { date: '2026-05-01', amount: 10 }])).toBe('down')
    expect(priceTrend(null)).toBeNull()
  })
})

describe('initials', () => {
  it('takes the first letter of up to two words', () => {
    expect(initials('Amazon Prime')).toBe('AP')
    expect(initials('netflix')).toBe('N')
    expect(initials('Disney+ Bundle Plan')).toBe('DB')
    expect(initials('')).toBe('?')
  })
})

describe('daysUntil', () => {
  it('counts whole days ignoring the time of day', () => {
    const today = new Date(2026, 8, 2, 23, 15)
    expect(daysUntil('2026-09-02', today)).toBe(0)
    expect(daysUntil('2026-09-10', today)).toBe(8)
    expect(daysUntil('2026-08-30', today)).toBe(-3)
  })
})

describe('monthlyTotalsByCurrency', () => {
  it('sums active, non-lapsed rows per currency', () => {
    const totals = monthlyTotalsByCurrency([
      { amount: 12, cadence: 'monthly', currency: 'USD', status: 'tracked' },
      { amount: 120, cadence: 'yearly', currency: 'USD', status: 'suggested' },
      { amount: 99, cadence: 'monthly', currency: 'USD', status: 'ignored' },
      { amount: 5, cadence: 'monthly', currency: 'USD', status: 'tracked', is_lapsed: true },
      { amount: 8, cadence: 'monthly', currency: 'EUR', status: 'tracked' },
    ])
    expect(totals).toEqual({ USD: 22, EUR: 8 })
  })
})
