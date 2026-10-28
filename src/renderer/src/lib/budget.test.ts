import { beforeEach, describe, expect, it } from 'vitest'
import { setMoneyLanguage } from '../../../shared/money'
import { budgetGroup, budgetRow, summariseBudget, type BudgetMonth } from '../../../shared/budget'
import { meterTone, monthDate, monthTense, parsePlanned, plannedText, withPlanned } from './budget'

beforeEach(() => setMoneyLanguage('el'))

describe('months', () => {
  it('should turn yyyy-MM into the first of that month', () => {
    expect(monthDate('2026-10')).toEqual(new Date(2026, 9, 1))
  })

  it('should tell past, current and future months apart', () => {
    expect(['2026-09', '2026-10', '2027-01'].map(m => monthTense(m, '2026-10'))).toEqual(['past', 'current', 'future'])
  })
})

describe('planned cell', () => {
  it('should show the amount without the symbol, and nothing for 0', () => {
    expect(plannedText(123_456)).toBe('1.234,56')
    expect(plannedText(0)).toBe('')
  })

  it('should read typed amounts, blank as 0, and refuse text or negatives', () => {
    expect(parsePlanned('600')).toEqual({ ok: true, cents: 60_000 })
    expect(parsePlanned('85,50')).toEqual({ ok: true, cents: 8_550 })
    expect(parsePlanned('  ')).toEqual({ ok: true, cents: 0 })
    expect(parsePlanned('abc')).toEqual({ ok: false, error: 'invalid' })
    expect(parsePlanned('-5')).toEqual({ ok: false, error: 'negative' })
  })
})

describe('meter', () => {
  it('should be on track below 90 %, warn from 90 % and turn red only when over', () => {
    expect(meterTone(8_900, 10_000)).toBe('accent')
    expect(meterTone(9_000, 10_000)).toBe('warning')
    expect(meterTone(10_000, 10_000)).toBe('warning')
    expect(meterTone(10_001, 10_000)).toBe('danger')
    expect(meterTone(500, 0)).toBe('danger')
    expect(meterTone(0, 0)).toBe('accent')
    expect(meterTone(50_000, 10_000, true)).toBe('income')
  })
})

describe('withPlanned', () => {
  it('should change one line and recompute the group and the tiles', () => {
    const row = (id: string, plannedCents: number, actualCents: number) =>
      budgetRow({ id, name: id, icon: null, archived: false, carryOver: false, plannedCents, carriedInCents: 0, actualCents, previousActualCents: 0 })
    const groups = [
      budgetGroup({ id: 'i', name: 'Income', type: 'INCOME', icon: null, categories: [row('salary', 200_000, 0)] }),
      budgetGroup({ id: 'b', name: 'Bills', type: 'BILL', icon: null, categories: [row('power', 0, 4_000)] }),
    ]
    const data: BudgetMonth = {
      month: '2026-10', exists: true, updatedAt: null, summary: summariseBudget(groups), groups,
      unplannedCount: 1, unplannedCents: 4_000, uncategorisedCount: 0, previousHasPlan: false, previousHasActual: false,
    }
    const next = withPlanned(data, 'power', 10_000)
    expect(next.groups[1]).toMatchObject({ plannedCents: 10_000, availableCents: 10_000 })
    expect(next.summary).toMatchObject({ leftToBudgetCents: 190_000, leftToSpendCents: 6_000 })
    expect(data.groups[1].plannedCents).toBe(0)
  })
})
