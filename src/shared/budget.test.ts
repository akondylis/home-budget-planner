import { describe, expect, it } from 'vitest'
import { actualFromSum, budgetGroup, budgetRow, computeCarry, roundUpToUnit, summariseBudget } from './budget'

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
