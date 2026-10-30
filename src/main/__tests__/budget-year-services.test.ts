import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { createAccounts } from '../services/accounts'
import { archiveCategory, createCategory, setCarryOver } from '../services/categories'
import { createTransaction, createTransfer } from '../services/transactions'
import { setPlanned } from '../services/budgets'
import { fillBudgetYear, getBudgetYear } from '../services/budget-year'
import type { BudgetYear } from '../../shared/budget'

async function setup() {
  const [bankId, savingsId] = await createAccounts([
    { name: 'Alpha', kind: 'CURRENT', institutionId: 'inst_alpha', openingBalanceCents: 100_000, openingDate: '2024-01-01' },
    { name: 'Savings', kind: 'SAVINGS', institutionId: 'inst_alpha', openingBalanceCents: 0, openingDate: '2024-01-01' },
  ])
  const incomeId = await createCategory({ name: 'Έσοδα', type: 'INCOME' })
  const salaryId = await createCategory({ name: 'Μισθός', parentId: incomeId })
  const spendId = await createCategory({ name: 'Έξοδα', type: 'EXPENSE' })
  const foodId = await createCategory({ name: 'Σούπερ μάρκετ', parentId: spendId })
  const clothesId = await createCategory({ name: 'Ρούχα', parentId: spendId })
  return { bankId, savingsId, salaryId, spendId, foodId, clothesId }
}

const expense = (accountId: string, categoryId: string, amountCents: number, bookedAt: string) =>
  createTransaction({ kind: 'EXPENSE', accountId, amountCents, bookedAt, categoryId })

const category = (b: BudgetYear, id: string) => b.groups.flatMap(g => g.categories).find(c => c.id === id)!
const plannedMonths = async (categoryId: string) =>
  (await prisma.budgetLine.findMany({ where: { categoryId }, include: { budget: true } })).map(l => l.budget.month).sort()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 30, 12))
  await resetTestDb()
})
afterEach(() => vi.useRealTimers())

describe('getBudgetYear', () => {
  it('should give plan and actual per month, leaving transfers and other years out', async () => {
    const { bankId, savingsId, salaryId, foodId } = await setup()
    await setPlanned('2026-01', foodId, 50_000)
    await setPlanned('2026-11', foodId, 60_000)
    await setPlanned('2026-10', salaryId, 300_000)
    await expense(bankId, foodId, 20_000, '2026-01-10')
    await expense(bankId, foodId, 7_000, '2025-12-31')
    await createTransaction({ kind: 'INCOME', accountId: bankId, amountCents: 300_000, bookedAt: '2026-10-01', categoryId: salaryId })
    await createTransfer({ fromAccountId: bankId, toAccountId: savingsId, amountCents: 50_000, bookedAt: '2026-03-02' })

    const y = await getBudgetYear(2026)
    const food = category(y, foodId)
    expect(y.elapsedMonths).toBe(10)
    expect(food.months[0]).toMatchObject({ plannedCents: 50_000, actualCents: 20_000, availableCents: 50_000 })
    expect(food.months[10].plannedCents).toBe(60_000)
    expect(food).toMatchObject({ plannedCents: 110_000, actualCents: 20_000, availableToDateCents: 50_000 })
    expect(y.summary).toMatchObject({ plannedIncomeCents: 300_000, actualIncomeCents: 300_000, plannedOutCents: 110_000, leftToSpendCents: 30_000 })
    expect(y.groups[1].months[0]).toEqual({ plannedCents: 50_000, actualCents: 20_000 })
    expect([y.exists, y.latestPlannedMonth]).toEqual([true, '2026-11'])
  })

  it('should chain carry-over from last year through the months', async () => {
    const { bankId, foodId } = await setup()
    await setCarryOver(foodId, true)
    await setPlanned('2025-12', foodId, 10_000)
    await expense(bankId, foodId, 4_000, '2025-12-03')
    await setPlanned('2026-01', foodId, 10_000)
    await expense(bankId, foodId, 13_000, '2026-01-03')

    const food = category(await getBudgetYear(2026), foodId)
    expect(food.carryInCents).toBe(6_000)
    expect(food.months[0]).toMatchObject({ carriedInCents: 6_000, availableCents: 16_000 })
    expect(food.months[1]).toMatchObject({ carriedInCents: 3_000, availableCents: 3_000 })
    expect(food.availableToDateCents).toBe(16_000)
  })

  it('should compare the same dates last year, and whole years for a past one', async () => {
    const { bankId, foodId, clothesId } = await setup()
    await expense(bankId, foodId, 10_000, '2026-10-30')
    await expense(bankId, foodId, 8_000, '2025-10-30')
    await expense(bankId, foodId, 9_000, '2025-10-31')
    await archiveCategory(clothesId)
    await expense(bankId, clothesId, 2_000, '2025-03-01')

    const y = await getBudgetYear(2026)
    expect(y.compare).toEqual({ from: '2026-01-01', to: '2026-10-30', lastFrom: '2025-01-01', lastTo: '2025-10-30', hasLastYear: true })
    expect(category(y, foodId)).toMatchObject({ thisYearCents: 10_000, lastYearCents: 8_000, lastYearFullCents: 17_000 })
    // Archived, but used last year: still in the comparison
    expect(category(y, clothesId)).toMatchObject({ archived: true, lastYearCents: 2_000 })

    const past = await getBudgetYear(2025)
    expect(past.compare).toMatchObject({ to: '2025-12-31', lastTo: '2024-12-31', hasLastYear: false })
    expect(category(past, foodId).thisYearCents).toBe(17_000)
    expect(past.elapsedMonths).toBe(12)
  })

  it('should show no comparison for a future year, and refuse a bad year', async () => {
    await setup()
    const y = await getBudgetYear(2027)
    expect([y.compare, y.elapsedMonths, y.exists]).toEqual([null, 0, false])
    await expect(getBudgetYear('2026')).rejects.toThrow('INVALID_INPUT')
    await expect(getBudgetYear(2026.5)).rejects.toThrow('INVALID_INPUT')
  })
})

describe('fillBudgetYear', () => {
  it("should copy a month's plan into the empty months from this month on, never overwriting", async () => {
    const { foodId, clothesId } = await setup()
    await setPlanned('2026-03', foodId, 50_000)
    await setPlanned('2026-03', clothesId, 10_000)
    await setPlanned('2026-11', foodId, 70_000)

    expect(await fillBudgetYear({ year: 2026, source: 'MONTH', month: '2026-03' })).toBe(5)
    expect(await plannedMonths(foodId)).toEqual(['2026-03', '2026-10', '2026-11', '2026-12'])
    const y = await getBudgetYear(2026)
    expect(category(y, foodId).months[10].plannedCents).toBe(70_000)
    expect(category(y, clothesId).months.map(m => m.plannedCents).slice(8)).toEqual([0, 10_000, 10_000, 10_000])
  })

  it('should fill all 12 months of another year with one amount or the bills', async () => {
    const { foodId } = await setup()
    expect(await fillBudgetYear({ year: 2027, source: 'AMOUNT', categoryId: foodId, cents: 40_000 })).toBe(12)
    expect(await fillBudgetYear({ year: 2027, source: 'AMOUNT', categoryId: foodId, cents: 40_000 })).toBe(0)
    await expect(fillBudgetYear({ year: 2027, source: 'RULES' })).rejects.toThrow('BUDGET_SOURCE_EMPTY')
  })

  it('should refuse an empty month, a group and bad input', async () => {
    const { spendId } = await setup()
    await expect(fillBudgetYear({ year: 2026, source: 'MONTH', month: '2026-02' })).rejects.toThrow('BUDGET_SOURCE_EMPTY')
    await expect(fillBudgetYear({ year: 2026, source: 'AMOUNT', categoryId: spendId, cents: 100 })).rejects.toThrow('CATEGORY_NOT_FOUND')
    await expect(fillBudgetYear({ year: 2026, source: 'AMOUNT', categoryId: spendId, cents: 0 })).rejects.toThrow('INVALID_INPUT')
    await expect(fillBudgetYear({ year: 2026, source: 'SOMETHING' })).rejects.toThrow('INVALID_INPUT')
  })
})
