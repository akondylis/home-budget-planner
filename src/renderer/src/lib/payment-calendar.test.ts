import { describe, expect, it } from 'vitest'
import {
  buildAgenda,
  buildYear,
  calendarSummary,
  countByStatus,
  listRange,
  monthGridRange,
  toIcsEntries,
  totalsOf,
} from './payment-calendar'
import type { PaymentStatus, UpcomingBill } from '../../../shared/recurrence'

// A Sunday
const TODAY = '2026-11-01'

const item = (dueDate: string, status: PaymentStatus, amountCents = -5_000, name = 'ΔΕΗ', over: Partial<UpcomingBill> = {}): UpcomingBill => ({
  ruleId: name, name, categoryId: 'c', categoryType: amountCents > 0 ? 'INCOME' : 'BILL', frequency: 'MONTH', interval: 1, dueDate,
  amountCents, amountVaries: false, remindDays: null, status, transactionId: null, paidBy: null, transactionText: null,
  transactionDate: null, debtId: null, instalment: null, ...over,
})

const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)

describe('totalsOf', () => {
  it('keeps money out and in apart and leaves skipped dates out', () => {
    const totals = totalsOf([
      item('2026-11-05', 'UPCOMING', -8_400),
      item('2026-11-05', 'PAID', -1_299, 'Netflix'),
      item('2026-11-05', 'SKIPPED', -3_000, 'Gym'),
      item('2026-11-05', 'UPCOMING', 180_000, 'Salary'),
    ])
    expect(totals).toEqual({ dueOut: -8_400, expectedIn: 180_000, paidOut: -1_299 })
  })
})

describe('status filter counts', () => {
  it('counts what is still to pay, paid and income', () => {
    const counts = countByStatus([
      item('2026-11-05', 'OVERDUE'),
      item('2026-11-06', 'PAID'),
      item('2026-11-07', 'PAID', 180_000, 'Salary'),
      item('2026-11-08', 'SKIPPED'),
    ])
    expect(counts).toEqual({ all: 4, toPay: 1, paid: 2, income: 1 })
  })
})

describe('ranges', () => {
  it('covers the whole weeks of the month grid', () => {
    expect(monthGridRange('2026-11', 1)).toEqual({ from: '2026-10-26', to: '2026-12-06' })
    expect(monthGridRange('2026-11', 0)).toEqual({ from: '2026-11-01', to: '2026-12-05' })
  })

  it('looks a month back for overdue ones and eight weeks ahead', () => {
    expect(listRange(TODAY, 1)).toEqual({ from: '2026-10-01', to: '2026-12-20' })
  })
})

describe('buildAgenda', () => {
  it('puts unpaid past dates on top and groups the rest by week', () => {
    const agenda = buildAgenda([
      item('2026-10-20', 'OVERDUE', -4_000, 'Water'),
      item('2026-10-25', 'PAID', -1_000, 'Old'),
      item('2026-11-01', 'DUE'),
      item('2026-11-03', 'UPCOMING', -2_000, 'Phone'),
      item('2026-11-20', 'UPCOMING', 180_000, 'Salary'),
      item('2027-02-01', 'UPCOMING', -2_000, 'Far'),
    ], TODAY, 1)
    expect(agenda.overdue.map(b => b.name)).toEqual(['Water'])
    expect(agenda.weeks.map(w => w.start)).toEqual(['2026-10-26', '2026-11-02', '2026-11-16'])
    expect(agenda.weeks[2].totals.expectedIn).toBe(180_000)
  })
})

describe('buildYear', () => {
  it('sums each month and finds the heaviest one', () => {
    const year = buildYear([
      item('2026-01-10', 'PAID', -20_000),
      item('2026-03-10', 'UPCOMING', -90_000, 'Insurance'),
      item('2026-03-12', 'SKIPPED', -50_000, 'Gym'),
      item('2026-03-25', 'UPCOMING', 180_000, 'Salary'),
      item('2026-03-25', 'UPCOMING', 10_000, 'Bonus'),
    ], 2026)
    expect(year.months).toHaveLength(12)
    expect(year.months[2]).toMatchObject({ out: -90_000, in: 190_000, unpaidCount: 1, payDays: ['2026-03-25'] })
    expect(year.heaviest).toBe('2026-03')
    expect(year.scale).toBe(190_000)
  })

  it('has no heaviest month when nothing goes out', () => {
    expect(buildYear([], 2026).heaviest).toBeNull()
  })
})

describe('calendarSummary', () => {
  it('names the next bill to pay and counts the overdue ones', () => {
    const summary = calendarSummary([
      item('2026-10-20', 'OVERDUE', -4_000, 'Water'),
      item('2026-11-02', 'UPCOMING', 180_000, 'Salary'),
      item('2026-11-03', 'UPCOMING', -2_000, 'Phone'),
    ], TODAY)
    expect(summary.next?.name).toBe('Phone')
    expect(summary.overdueCount).toBe(1)
  })
})

describe('toIcsEntries', () => {
  it('exports open dates from today on with a stable uid and a reminder for bills only', () => {
    const entries = toIcsEntries([
      item('2026-10-20', 'OVERDUE', -4_000, 'Water'),
      item('2026-11-03', 'PAID', -2_000, 'Phone'),
      item('2026-11-05', 'UPCOMING', -8_400, 'ΔΕΗ', { amountVaries: true }),
      item('2026-11-25', 'UPCOMING', 180_000, 'Salary'),
      item('2026-11-26', 'UPCOMING', -10_000, 'Loan', { remindDays: 5, instalment: { n: 2, of: 12 } }),
    ], TODAY, 3, t)
    expect(entries.map(e => e.uid)).toEqual(['ΔΕΗ-2026-11-05', 'Salary-2026-11-25', 'Loan-2026-11-26'])
    expect(entries[0].summary).toMatch(/^ΔΕΗ · ≈ /)
    expect(entries.map(e => e.remindDays)).toEqual([3, null, 5])
    expect(entries[2].description).toContain('debts.instalment_n')
  })
})
