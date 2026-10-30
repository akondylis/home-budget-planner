import { describe, expect, it } from 'vitest'
import { addMonths, dateOnlyToDate, dateToDateOnly, dayRange, isDateOnly, isMonth, isYear, monthRange, todayDateOnly, yearMonths } from './date-only'

describe('date-only', () => {
  it('should round-trip a date through its stored form', () => {
    expect(dateToDateOnly(dateOnlyToDate('2026-10-26'))).toBe('2026-10-26')
    expect(dateOnlyToDate('2026-10-26').toISOString()).toBe('2026-10-26T12:00:00.000Z')
  })

  it('should reject impossible dates and other shapes', () => {
    expect(isDateOnly('2026-02-29')).toBe(false)
    expect(isDateOnly('2028-02-29')).toBe(true)
    expect(isDateOnly('26/10/2026')).toBe(false)
    expect(isDateOnly(null)).toBe(false)
    expect(() => dateOnlyToDate('2026-13-01')).toThrow('INVALID_DATE')
  })

  it('should give today in local time', () => {
    expect(todayDateOnly(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('should cover a whole month, including its last day, when building a month range', () => {
    const { gte, lt } = monthRange('2026-12')
    expect(gte.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(lt.toISOString()).toBe('2027-01-01T00:00:00.000Z')
    const lastDay = dateOnlyToDate('2026-12-31')
    expect(lastDay >= gte && lastDay < lt).toBe(true)
  })

  it('should validate months and step across years', () => {
    expect(isMonth('2026-10')).toBe(true)
    expect(isMonth('2026-13')).toBe(false)
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
  })
})

describe('years and day ranges', () => {
  it('should accept whole years only', () => {
    expect([isYear(2026), isYear(2026.5), isYear('2026'), isYear(10_000)]).toEqual([true, false, false, false])
  })

  it('should list the 12 months of a year', () => {
    expect(yearMonths(2026)).toHaveLength(12)
    expect([yearMonths(2026)[0], yearMonths(2026)[11]]).toEqual(['2026-01', '2026-12'])
  })

  it('should include both days of a range, rows being stored at 12:00 UTC', () => {
    const r = dayRange('2025-01-01', '2025-10-30')
    expect(r.gte.toISOString()).toBe('2025-01-01T00:00:00.000Z')
    expect(r.lt.toISOString()).toBe('2025-10-31T00:00:00.000Z')
    expect(() => dayRange('2025-02-30', '2025-03-01')).toThrow('INVALID_DATE')
  })
})
