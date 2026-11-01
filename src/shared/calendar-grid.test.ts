import { describe, expect, it } from 'vitest'
import { isWeekStart, monthEnd, monthWeeks, weekStart, weekdayNames } from './calendar-grid'

describe('weekStart', () => {
  it('goes back to Monday by default', () => {
    // 2026-11-01 is a Sunday
    expect(weekStart('2026-11-01')).toBe('2026-10-26')
    expect(weekStart('2026-11-02')).toBe('2026-11-02')
  })

  it('goes back to Sunday when the week starts on Sunday', () => {
    expect(weekStart('2026-11-01', 0)).toBe('2026-11-01')
    expect(weekStart('2026-11-07', 0)).toBe('2026-11-01')
  })
})

describe('monthWeeks', () => {
  it('covers the month in whole weeks from the first day of the week', () => {
    const weeks = monthWeeks('2026-11')
    expect(weeks[0][0]).toBe('2026-10-26')
    expect(weeks.at(-1)?.at(-1)).toBe('2026-12-06')
    expect(weeks).toHaveLength(6)
    expect(weeks.every(w => w.length === 7)).toBe(true)
  })

  it('needs fewer weeks when the month starts on the first day of the week', () => {
    // November 2026 starts on a Sunday
    expect(monthWeeks('2026-11', 0)).toHaveLength(5)
    expect(monthWeeks('2026-11', 0)[0][0]).toBe('2026-11-01')
  })

  it('handles February in a leap year', () => {
    expect(monthEnd('2028-02')).toBe('2028-02-29')
    expect(monthWeeks('2028-02').flat()).toContain('2028-02-29')
  })
})

describe('weekdayNames', () => {
  it('starts on the chosen day', () => {
    expect(weekdayNames('en-GB', 1)[0]).toBe('Mon')
    expect(weekdayNames('en-GB', 0)[0]).toBe('Sun')
    expect(weekdayNames('en-GB', 0)).toHaveLength(7)
  })
})

describe('isWeekStart', () => {
  it('accepts Monday and Sunday only', () => {
    expect(isWeekStart(1)).toBe(true)
    expect(isWeekStart(0)).toBe(true)
    expect(isWeekStart(6)).toBe(false)
    expect(isWeekStart('1')).toBe(false)
  })
})
