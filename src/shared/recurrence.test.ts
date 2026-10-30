import { describe, expect, it } from 'vitest'
import { addDays, addMonthsToDate } from './date-only'
import {
  canPay,
  matchOccurrences,
  monthlyEquivalentCents,
  nextDue,
  occurrenceStatus,
  occurrencesBetween,
  ruleAmount,
  type MatchRule,
  type PaymentCandidate,
  type Schedule,
} from './recurrence'

const monthly = (anchorDate: string, interval = 1, endsAt: string | null = null): Schedule =>
  ({ frequency: 'MONTH', interval, anchorDate, endsAt })

describe('day-level date helpers', () => {
  it('should add days across a month and a year', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('should clamp the day to the end of a shorter month, leap years included', () => {
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsToDate('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsToDate('2026-05-31', -2)).toBe('2026-03-31')
  })
})

describe('occurrencesBetween', () => {
  it('should keep the anchor day after a short month (31st → 28 Feb → 31 Mar)', () => {
    expect(occurrencesBetween(monthly('2026-01-31'), '2026-01-01', '2026-04-30'))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('should step every 3 months for a quarterly bill and leave out dates before the range', () => {
    expect(occurrencesBetween(monthly('2026-01-15', 3), '2026-03-01', '2026-12-31'))
      .toEqual(['2026-04-15', '2026-07-15', '2026-10-15'])
  })

  it('should step every two weeks', () => {
    expect(occurrencesBetween({ frequency: 'WEEK', interval: 2, anchorDate: '2026-10-02', endsAt: null }, '2026-10-01', '2026-11-01'))
      .toEqual(['2026-10-02', '2026-10-16', '2026-10-30'])
  })

  it('should step yearly from 29 Feb to 28 Feb', () => {
    expect(occurrencesBetween({ frequency: 'YEAR', interval: 1, anchorDate: '2028-02-29', endsAt: null }, '2028-01-01', '2029-12-31'))
      .toEqual(['2028-02-29', '2029-02-28'])
  })

  it('should stop at the end date and give nothing before the anchor', () => {
    expect(occurrencesBetween(monthly('2026-01-10', 1, '2026-03-10'), '2026-01-01', '2026-12-31')).toHaveLength(3)
    expect(occurrencesBetween(monthly('2027-01-10'), '2026-01-01', '2026-12-31')).toEqual([])
  })
})

describe('nextDue', () => {
  it('should give today when due today, the next date otherwise, and null once ended', () => {
    expect(nextDue(monthly('2026-01-30'), '2026-10-30')).toBe('2026-10-30')
    expect(nextDue(monthly('2026-01-30'), '2026-10-31')).toBe('2026-11-30')
    expect(nextDue(monthly('2026-01-30', 1, '2026-06-30'), '2026-10-31')).toBeNull()
  })
})

describe('monthlyEquivalentCents', () => {
  it('should spread yearly, quarterly and weekly amounts over a month, rounded up to the cent', () => {
    expect(monthlyEquivalentCents(48_000, 'YEAR', 1)).toBe(4_000)
    expect(monthlyEquivalentCents(30_000, 'MONTH', 3)).toBe(10_000)
    expect(monthlyEquivalentCents(999, 'MONTH', 1)).toBe(999)
    expect(monthlyEquivalentCents(1_000, 'WEEK', 1)).toBe(4_334)
  })
})

describe('occurrenceStatus', () => {
  it('should prefer a hand mark, then overdue, due within 3 days, upcoming', () => {
    expect(occurrenceStatus('2026-10-01', '2026-10-30', 'PAID')).toBe('PAID')
    expect(occurrenceStatus('2026-10-01', '2026-10-30', 'SKIPPED')).toBe('SKIPPED')
    expect(occurrenceStatus('2026-10-29', '2026-10-30', null)).toBe('OVERDUE')
    expect(occurrenceStatus('2026-11-02', '2026-10-30', null)).toBe('DUE')
    expect(occurrenceStatus('2026-11-03', '2026-10-30', null)).toBe('UPCOMING')
  })
})

describe('matching rows to due dates', () => {
  const rule: MatchRule = { frequency: 'MONTH', amountCents: ruleAmount(1_299, 'SUBSCRIPTION'), amountVaries: false, accountId: null, matchKey: 'netflix' }
  const row = (id: string, bookedAt: string, amountCents = -1_299, key = 'netflix com', accountId = 'a1'): PaymentCandidate =>
    ({ id, bookedAt, amountCents, accountId, key, text: key })

  it('should need the same sign, the bank text and an amount within 10 % unless it varies', () => {
    expect(canPay(rule, row('t', '2026-10-01'))).toBe(true)
    expect(canPay(rule, row('t', '2026-10-01', 1_299))).toBe(false)
    expect(canPay(rule, row('t', '2026-10-01', -1_299, 'spotify'))).toBe(false)
    expect(canPay(rule, row('t', '2026-10-01', -1_500))).toBe(false)
    expect(canPay({ ...rule, amountVaries: true }, row('t', '2026-10-01', -1_500))).toBe(true)
    expect(canPay({ ...rule, accountId: 'a2' }, row('t', '2026-10-01'))).toBe(false)
  })

  it('should take the nearest row within 7 days and let a row pay only one due date', () => {
    const paid = matchOccurrences(rule, ['2026-09-05', '2026-10-05'], [row('far', '2026-09-20'), row('sep', '2026-09-07'), row('oct', '2026-10-04')], new Set())
    expect(paid.get('2026-09-05')?.id).toBe('sep')
    expect(paid.get('2026-10-05')?.id).toBe('oct')
    const one = matchOccurrences(rule, ['2026-10-01', '2026-10-05'], [row('only', '2026-10-03')], new Set())
    expect(one.size).toBe(1)
  })

  it('should skip rows already marked by hand', () => {
    expect(matchOccurrences(rule, ['2026-10-05'], [row('hand', '2026-10-05')], new Set(['hand'])).size).toBe(0)
  })
})
