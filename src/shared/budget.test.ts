import { describe, expect, it } from 'vitest'
import {
  actualFromSum,
  budgetGroup,
  budgetRow,
  carrySeries,
  compareRange,
  computeCarry,
  elapsedMonths,
  fillMonths,
  roundUpToUnit,
  summariseBudget,
  summariseYear,
  yearGroup,
  yearRow,
} from './budget'

const row = (id: string, plannedCents: number, actualCents: number, carriedInCents = 0) =>
  budgetRow({ id, name: id, icon: null, archived: false, carryOver: carriedInCents > 0, plannedCents, carriedInCents, actualCents, previousActualCents: 0, suggestedCents: 0 })

describe('actualFromSum', () => {
  it('should count spending positive on outgoing categories and lower it with a refund', () => {
    expect(actualFromSum('EXPENSE', -12_000)).toBe(12_000)
    expect(actualFromSum('BILL', -5_000 + 1_000)).toBe(4_000)
  })

  it('should give plain 0 (never -0) for a month with no rows', () => {
    expect(Object.is(actualFromSum('EXPENSE', 0), 0)).toBe(true)
  })

  it('should keep income positive', () => {
    expect(actualFromSum('INCOME', 240_000)).toBe(240_000)
  })
})

describe('computeCarry', () => {
  it('should carry unspent money month after month', () => {
    expect(computeCarry([{ plannedCents: 10_000, actualCents: 6_000 }, { plannedCents: 10_000, actualCents: 9_000 }])).toBe(5_000)
  })

  it('should stop at zero when a month is overspent, so overspending never carries', () => {
    expect(computeCarry([{ plannedCents: 10_000, actualCents: 13_000 }])).toBe(0)
    expect(computeCarry([
      { plannedCents: 10_000, actualCents: 2_000 },
      { plannedCents: 5_000, actualCents: 20_000 },
      { plannedCents: 5_000, actualCents: 0 },
    ])).toBe(5_000)
  })

  it('should still carry through a month with no line', () => {
    expect(computeCarry([{ plannedCents: 10_000, actualCents: 0 }, { plannedCents: 0, actualCents: 4_000 }])).toBe(6_000)
  })

  it('should carry nothing without months', () => {
    expect(computeCarry([])).toBe(0)
  })
})

describe('roundUpToUnit', () => {
  it('should round up to whole euros and never go below zero', () => {
    expect(roundUpToUnit(12_301)).toBe(12_400)
    expect(roundUpToUnit(12_300)).toBe(12_300)
    expect(roundUpToUnit(-500)).toBe(0)
  })
})

describe('budget rows and summary', () => {
  it('should add the carry to what is available and leave a negative left when over', () => {
    expect(row('a', 10_000, 4_000, 2_000)).toMatchObject({ availableCents: 12_000, leftCents: 8_000 })
    expect(row('b', 10_000, 13_000)).toMatchObject({ availableCents: 10_000, leftCents: -3_000 })
  })

  it('should give left to budget (zero-based) and left to spend over outgoing groups', () => {
    const income = budgetGroup({ id: 'i', name: 'Income', type: 'INCOME', icon: null, categories: [row('salary', 300_000, 300_000)] })
    const bills = budgetGroup({ id: 'b', name: 'Bills', type: 'BILL', icon: null, categories: [row('power', 10_000, 8_000), row('water', 3_000, 3_500)] })
    const spend = budgetGroup({ id: 's', name: 'Spending', type: 'EXPENSE', icon: null, categories: [row('food', 60_000, 20_000, 5_000)] })
    expect(bills).toMatchObject({ plannedCents: 13_000, availableCents: 13_000, actualCents: 11_500 })
    expect(summariseBudget([income, bills, spend])).toEqual({
      plannedIncomeCents: 300_000,
      actualIncomeCents: 300_000,
      plannedOutCents: 73_000,
      availableOutCents: 78_000,
      actualOutCents: 31_500,
      leftToBudgetCents: 227_000,
      leftToSpendCents: 46_500,
    })
  })
})

const twelve = (values: Record<number, number>) => Array.from({ length: 12 }, (_, i) => values[i] ?? 0)
const yRow = (id: string, planned: number[], actual: number[], carries = false, carryInCents = 0, elapsed = 10) =>
  yearRow(
    { id, name: id, icon: null, archived: false, carryOver: carries, carries, carryInCents, planned, actual, thisYearCents: 0, lastYearCents: 0, lastYearFullCents: 0, suggestedCents: 0 },
    elapsed,
  )

describe('carrySeries', () => {
  it('should give what each month starts with, ending with computeCarry', () => {
    const months = [{ plannedCents: 100, actualCents: 40 }, { plannedCents: 0, actualCents: 80 }, { plannedCents: 50, actualCents: 0 }]
    expect(carrySeries(months, 10)).toEqual([10, 70, 0, 50])
    expect(carrySeries(months).at(-1)).toBe(computeCarry(months))
  })
})

describe('year ranges', () => {
  it('should count the months that have started', () => {
    expect([elapsedMonths(2025, '2026-10'), elapsedMonths(2026, '2026-10'), elapsedMonths(2027, '2026-10')]).toEqual([12, 10, 0])
  })

  it('should fill from this month on in the current year, all months in another', () => {
    expect(fillMonths(2026, '2026-10')).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(fillMonths(2027, '2026-10')).toHaveLength(12)
    expect(fillMonths(2025, '2026-10')).toHaveLength(12)
  })

  it('should compare the same dates last year, 29 Feb as 28 Feb, a past year whole, a future year not at all', () => {
    expect(compareRange(2026, '2026-10-30')).toEqual({ from: '2026-01-01', to: '2026-10-30', lastFrom: '2025-01-01', lastTo: '2025-10-30' })
    expect(compareRange(2028, '2028-02-29')?.lastTo).toBe('2027-02-28')
    expect(compareRange(2025, '2026-10-30')).toMatchObject({ to: '2025-12-31', lastTo: '2024-12-31' })
    expect(compareRange(2027, '2026-10-30')).toBeNull()
  })
})

describe('yearRow, yearGroup and summariseYear', () => {
  it('should sum the year and count only the months so far towards what is available', () => {
    const r = yRow('food', twelve({ 0: 500, 10: 600 }), twelve({ 0: 200 }))
    expect(r).toMatchObject({ plannedCents: 1_100, actualCents: 200, availableToDateCents: 500 })
    expect(r.months[1]).toEqual({ plannedCents: 0, actualCents: 0, carriedInCents: 0, availableCents: 0 })
  })

  it('should chain unspent money month to month for a carry-over category', () => {
    const r = yRow('food', twelve({ 0: 100, 1: 100 }), twelve({ 0: 30, 1: 250 }), true, 20)
    expect(r.months.slice(0, 3).map(m => m.availableCents)).toEqual([120, 190, 0])
    expect(r.availableToDateCents).toBe(220)
  })

  it('should sum groups per month and give the tiles', () => {
    const out = yearGroup({ id: 'g', name: 'g', type: 'EXPENSE', icon: null, categories: [yRow('a', twelve({ 0: 100 }), twelve({ 0: 150 })), yRow('b', twelve({ 0: 50, 11: 50 }), twelve({}))] })
    const income = yearGroup({ id: 'i', name: 'i', type: 'INCOME', icon: null, categories: [yRow('s', twelve({ 0: 1_000 }), twelve({ 0: 1_000 }))] })
    expect(out.months[0]).toEqual({ plannedCents: 150, actualCents: 150 })
    expect(out.plannedCents).toBe(200)
    expect(summariseYear([income, out])).toEqual({
      plannedIncomeCents: 1_000,
      actualIncomeCents: 1_000,
      plannedOutCents: 200,
      actualOutCents: 150,
      availableOutToDateCents: 150,
      leftToBudgetCents: 800,
      leftToSpendCents: 0,
    })
  })
})
