import { describe, expect, it } from 'vitest'
import { budgetProgress, daysLeftInMonth, greetingKey, perDay, safeToSpend } from './safe-to-spend'

describe('safeToSpend', () => {
  it('subtracts bills and budget headroom from cash', () => {
    expect(safeToSpend({ cash: 2460, upcomingBills: 1215, budgetRemaining: 60 })).toBe(1185)
    expect(safeToSpend({ cash: 100, upcomingBills: 150, budgetRemaining: 0 })).toBe(-50)
  })
})

describe('perDay', () => {
  it('spreads a positive amount over the remaining days and floors at zero', () => {
    expect(perDay(1185, 10)).toBe(118.5)
    expect(perDay(-50, 10)).toBe(0)
    expect(perDay(90, 0)).toBe(90)
  })
})

describe('daysLeftInMonth', () => {
  it('counts today inclusive', () => {
    expect(daysLeftInMonth(new Date(2026, 8, 2))).toBe(29)
    expect(daysLeftInMonth(new Date(2026, 1, 28))).toBe(1)
    expect(daysLeftInMonth(new Date(2028, 1, 1))).toBe(29)
  })
})

describe('budgetProgress', () => {
  it('clamps and handles missing budgets', () => {
    expect(budgetProgress(50, 100)).toBe(0.5)
    expect(budgetProgress(150, 100)).toBe(1)
    expect(budgetProgress(10, null)).toBeNull()
    expect(budgetProgress(10, 0)).toBeNull()
  })
})

describe('greetingKey', () => {
  it('picks a greeting by hour', () => {
    expect(greetingKey(7)).toBe('home.greetingMorning')
    expect(greetingKey(13)).toBe('home.greetingAfternoon')
    expect(greetingKey(21)).toBe('home.greetingEvening')
  })
})
