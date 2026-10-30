import { describe, expect, it } from 'vitest'
import { planMonthFor, projectMonths, type ProjectionInput, type ProjectionRule } from './projection'
import type { CategoryType } from './ledger'

const categories = new Map<string, { name: string; type: CategoryType }>([
  ['salary', { name: 'Salary', type: 'INCOME' }],
  ['food', { name: 'Food', type: 'EXPENSE' }],
  ['power', { name: 'Power', type: 'BILL' }],
  ['insurance', { name: 'Insurance', type: 'BILL' }],
  ['saving', { name: 'Saving', type: 'SAVINGS' }],
])

const monthly = (name: string, categoryId: string, amountCents: number, anchorDate: string, endsAt: string | null = null): ProjectionRule => ({
  name, categoryId, amountCents, schedule: { frequency: 'MONTH', interval: 1, anchorDate, endsAt },
})

const input = (over: Partial<ProjectionInput> = {}): ProjectionInput => ({
  today: '2026-10-30',
  startCents: 100_000,
  accountCount: 1,
  months: 3,
  categories,
  rules: [],
  plans: new Map(),
  actualSoFar: new Map(),
  ...over,
})

const line = (p: ReturnType<typeof projectMonths>, i: number, id: string) => p.months[i].lines.find(l => l.categoryId === id)

describe('planMonthFor', () => {
  it("should take the month's own plan, else this month's or the latest before it, never a later one-off", () => {
    expect(planMonthFor('2026-12', ['2026-10', '2026-11'], '2026-10')).toBe('2026-10')
    expect(planMonthFor('2026-11', ['2026-10', '2026-11'], '2026-10')).toBe('2026-11')
    expect(planMonthFor('2026-12', ['2026-08'], '2026-10')).toBe('2026-08')
    expect(planMonthFor('2026-12', ['2026-11'], '2026-10')).toBeNull()
  })
})

describe('projectMonths', () => {
  it('should run the balance from today through the horizon, the current month first', () => {
    const p = projectMonths(input({ rules: [monthly('Salary', 'salary', 200_000, '2026-01-25')], months: 12 }))
    expect(p.months.map(m => m.month).slice(0, 3)).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(p.months).toHaveLength(12)
    expect(p.months[1]).toMatchObject({ startCents: 300_000, inCents: 200_000, outCents: 0, endCents: 500_000 })
    expect(p.endCents).toBe(100_000 + 12 * 200_000)
  })

  it('should count the larger of plan and bills per category, keeping the sign', () => {
    const plans = new Map([['2026-11', new Map([['power', 8_000], ['salary', 250_000], ['food', 40_000]])]])
    const p = projectMonths(input({ plans, rules: [monthly('Power', 'power', 9_000, '2026-01-10'), monthly('Salary', 'salary', 200_000, '2026-01-25')] }))
    expect(line(p, 1, 'power')).toMatchObject({ amountCents: -9_000, source: 'BOTH', ruleNames: ['Power'] })
    expect(line(p, 1, 'salary')).toMatchObject({ amountCents: 250_000, source: 'BOTH' })
    expect(line(p, 1, 'food')).toMatchObject({ amountCents: -40_000, source: 'PLAN' })
    expect(p.months[1]).toMatchObject({ inCents: 250_000, outCents: 49_000, planMonth: '2026-11' })
    // Largest first
    expect(p.months[1].lines.map(l => l.categoryId)).toEqual(['salary', 'food', 'power'])
  })

  it("should repeat this month's plan in months that have none, never a one-off later month", () => {
    const plans = new Map([['2026-09', new Map([['food', 30_000]])], ['2026-11', new Map([['food', 900_000]])]])
    const p = projectMonths(input({ plans }))
    expect(p.months.map(m => m.planMonth)).toEqual(['2026-09', '2026-11', '2026-09'])
    expect(line(p, 2, 'food')?.amountCents).toBe(-30_000)
    expect(p.hasPlan).toBe(true)
  })

  it('should add only what is still to come this month, never below 0', () => {
    const plans = new Map([['2026-10', new Map([['food', 50_000], ['power', 9_000]])]])
    const rules = [monthly('Power', 'power', 9_000, '2026-01-10'), monthly('Salary', 'salary', 200_000, '2026-01-25')]
    // Power and salary already booked, food 20k spent; a refund-free overspend elsewhere adds nothing
    const actualSoFar = new Map([['power', 9_000], ['salary', 200_000], ['food', 20_000]])
    const p = projectMonths(input({ plans, rules, actualSoFar }))
    expect(p.months[0].lines.map(l => [l.categoryId, l.amountCents])).toEqual([['food', -30_000]])
    expect(p.months[0].endCents).toBe(70_000)
    const over = projectMonths(input({ plans, actualSoFar: new Map([['food', 60_000]]) }))
    expect(line(over, 0, 'food')).toBeUndefined()
  })

  it('should leave planned saving out but count saving rules', () => {
    const plans = new Map([['2026-11', new Map([['saving', 20_000]])]])
    expect(projectMonths(input({ plans })).months[1].lines).toEqual([])
    const p = projectMonths(input({ plans, rules: [monthly('Pension', 'saving', 5_000, '2026-01-01')] }))
    expect(line(p, 1, 'saving')).toMatchObject({ amountCents: -5_000, source: 'RULES' })
  })

  it('should put yearly and every-2-months rules in their months and stop at the end date', () => {
    const rules: ProjectionRule[] = [
      { name: 'Insurance', categoryId: 'insurance', amountCents: 60_000, schedule: { frequency: 'YEAR', interval: 1, anchorDate: '2024-12-15', endsAt: null } },
      { name: 'Power', categoryId: 'power', amountCents: 10_000, schedule: { frequency: 'MONTH', interval: 2, anchorDate: '2026-11-10', endsAt: '2027-01-31' } },
    ]
    const p = projectMonths(input({ rules, months: 6, today: '2026-11-01' }))
    expect(p.months.map(m => m.outCents)).toEqual([10_000, 60_000, 10_000, 0, 0, 0])
  })

  it('should find the lowest month-end and the first month below 0', () => {
    const rules = [monthly('Rent', 'food', 60_000, '2026-01-01')]
    const p = projectMonths(input({ rules, months: 3, today: '2026-10-01' }))
    expect(p.months.map(m => m.endCents)).toEqual([40_000, -20_000, -80_000])
    expect(p.lowest).toEqual({ month: '2026-12', cents: -80_000 })
    expect(p.firstNegativeMonth).toBe('2026-11')
    const flat = projectMonths(input())
    expect([flat.lowest, flat.firstNegativeMonth, flat.hasRules, flat.hasPlan]).toEqual([{ month: '2026-10', cents: 100_000 }, null, false, false])
  })

  it('should skip a rule or plan whose category is unknown (archived or a group)', () => {
    const p = projectMonths(input({ rules: [monthly('Ghost', 'gone', 5_000, '2026-01-01')] }))
    expect(p.months.every(m => m.lines.length === 0)).toBe(true)
  })
})
