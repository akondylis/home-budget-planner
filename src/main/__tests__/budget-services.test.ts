import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { createAccounts } from '../services/accounts'
import { archiveCategory, createCategory, deleteCategory, mergeCategory, setCarryOver } from '../services/categories'
import { createTransaction, createTransfer } from '../services/transactions'
import { clearBudget, copyBudget, getBudgetMonth, setPlanned } from '../services/budgets'
import type { BudgetMonth } from '../../shared/budget'

async function setup() {
  const [bankId, savingsId] = await createAccounts([
    { name: 'Alpha', kind: 'CURRENT', institution: 'ALPHA', openingBalanceCents: 100_000, openingDate: '2026-08-01' },
    { name: 'Savings', kind: 'SAVINGS', institution: 'ALPHA', openingBalanceCents: 0, openingDate: '2026-08-01' },
  ])
  const incomeId = await createCategory({ name: 'Έσοδα', type: 'INCOME' })
  const salaryId = await createCategory({ name: 'Μισθός', parentId: incomeId })
  const spendId = await createCategory({ name: 'Έξοδα', type: 'EXPENSE' })
  const foodId = await createCategory({ name: 'Σούπερ μάρκετ', parentId: spendId })
  const clothesId = await createCategory({ name: 'Ρούχα', parentId: spendId })
  return { bankId, savingsId, incomeId, salaryId, spendId, foodId, clothesId }
}

const expense = (accountId: string, categoryId: string, amountCents: number, bookedAt: string) =>
  createTransaction({ kind: 'EXPENSE', accountId, amountCents, bookedAt, categoryId })

const category = (b: BudgetMonth, id: string) => b.groups.flatMap(g => g.categories).find(c => c.id === id)!

beforeEach(() => resetTestDb())

describe('setPlanned', () => {
  it('should create the month on first use, update the line, and remove it at 0', async () => {
    const { foodId } = await setup()
    await setPlanned('2026-10', foodId, 60_000)
    await setPlanned('2026-10', foodId, 55_000)
    let b = await getBudgetMonth('2026-10')
    expect(b.exists).toBe(true)
    expect(category(b, foodId).plannedCents).toBe(55_000)
    await setPlanned('2026-10', foodId, 0)
    b = await getBudgetMonth('2026-10')
    expect(b.exists).toBe(false)
    expect(await prisma.budgetLine.count()).toBe(0)
  })

  it('should refuse negative or fractional amounts, groups, archived categories and bad months', async () => {
    const { foodId, spendId, clothesId } = await setup()
    await expect(setPlanned('2026-10', foodId, -1)).rejects.toThrow('INVALID_AMOUNT')
    await expect(setPlanned('2026-10', foodId, 1.5)).rejects.toThrow('INVALID_AMOUNT')
    await expect(setPlanned('2026-10', spendId, 100)).rejects.toThrow('CATEGORY_NOT_FOUND')
    await archiveCategory(clothesId)
    await expect(setPlanned('2026-10', clothesId, 100)).rejects.toThrow('CATEGORY_NOT_FOUND')
    await expect(setPlanned('2026-13', foodId, 100)).rejects.toThrow('INVALID_INPUT')
  })
})

describe('getBudgetMonth', () => {
  it('should compare plan with actual, leaving transfers and other months out', async () => {
    const { bankId, savingsId, salaryId, foodId } = await setup()
    await setPlanned('2026-10', salaryId, 300_000)
    await setPlanned('2026-10', foodId, 60_000)
    await createTransaction({ kind: 'INCOME', accountId: bankId, amountCents: 300_000, bookedAt: '2026-10-01', categoryId: salaryId })
    await expense(bankId, foodId, 20_000, '2026-10-05')
    await expense(bankId, foodId, 5_000, '2026-09-30')
    await createTransfer({ fromAccountId: bankId, toAccountId: savingsId, amountCents: 50_000, bookedAt: '2026-10-02' })

    const b = await getBudgetMonth('2026-10')
    expect(category(b, foodId)).toMatchObject({ plannedCents: 60_000, actualCents: 20_000, leftCents: 40_000, previousActualCents: 5_000 })
    expect(b.summary).toMatchObject({ plannedIncomeCents: 300_000, actualIncomeCents: 300_000, leftToBudgetCents: 240_000, leftToSpendCents: 40_000 })
    expect([b.previousHasActual, b.previousHasPlan, b.uncategorisedCount]).toEqual([true, false, 0])
  })

  it('should count spending with no plan and rows still to categorise', async () => {
    const { bankId, foodId, clothesId } = await setup()
    await setPlanned('2026-10', foodId, 60_000)
    await expense(bankId, clothesId, 8_000, '2026-10-05')
    await prisma.transaction.create({ data: { accountId: bankId, amountCents: -1_000, bookedAt: new Date('2026-10-06T12:00:00Z') } })
    const b = await getBudgetMonth('2026-10')
    expect([b.unplannedCount, b.unplannedCents, b.uncategorisedCount]).toEqual([1, 8_000, 1])
  })

  it('should still show an archived category in a month it was used in', async () => {
    const { bankId, clothesId } = await setup()
    await expense(bankId, clothesId, 8_000, '2026-10-05')
    await archiveCategory(clothesId)
    expect(category(await getBudgetMonth('2026-10'), clothesId)).toMatchObject({ archived: true, actualCents: 8_000 })
    expect(category(await getBudgetMonth('2026-11'), clothesId)).toBeUndefined()
  })

  it('should carry unspent money of a carry-over category, but never overspending', async () => {
    const { bankId, clothesId, foodId } = await setup()
    await setCarryOver(clothesId, true)
    await setPlanned('2026-08', clothesId, 10_000)
    await expense(bankId, clothesId, 6_000, '2026-08-10')
    // September has no line and spends 1.000, so 3.000 carries on
    await expense(bankId, clothesId, 1_000, '2026-09-10')
    await setPlanned('2026-10', clothesId, 10_000)
    await setPlanned('2026-08', foodId, 10_000)
    await expense(bankId, foodId, 1_000, '2026-08-10')
    const b = await getBudgetMonth('2026-10')
    expect(category(b, clothesId)).toMatchObject({ carriedInCents: 3_000, availableCents: 13_000 })
    expect(category(b, foodId).carriedInCents).toBe(0)

    await expense(bankId, clothesId, 20_000, '2026-10-10')
    expect(category(await getBudgetMonth('2026-11'), clothesId).carriedInCents).toBe(0)
  })
})

describe('copyBudget', () => {
  it('should fill only empty lines from last month\'s plan', async () => {
    const { foodId, clothesId, salaryId } = await setup()
    await setPlanned('2026-09', foodId, 60_000)
    await setPlanned('2026-09', clothesId, 10_000)
    await setPlanned('2026-10', foodId, 50_000)
    expect(await copyBudget({ from: '2026-09', to: '2026-10', source: 'PLAN' })).toBe(1)
    const b = await getBudgetMonth('2026-10')
    expect([foodId, clothesId, salaryId].map(id => category(b, id).plannedCents)).toEqual([50_000, 10_000, 0])
  })

  it('should start from last month\'s spending rounded up to whole euros', async () => {
    const { bankId, foodId } = await setup()
    await expense(bankId, foodId, 12_345, '2026-09-10')
    expect(await copyBudget({ from: '2026-09', to: '2026-10', source: 'ACTUAL' })).toBe(1)
    expect(category(await getBudgetMonth('2026-10'), foodId).plannedCents).toBe(12_400)
  })

  it('should throw BUDGET_SOURCE_EMPTY when there is nothing to copy', async () => {
    await setup()
    await expect(copyBudget({ from: '2026-09', to: '2026-10', source: 'PLAN' })).rejects.toThrow('BUDGET_SOURCE_EMPTY')
    await expect(copyBudget({ from: '2026-09', to: '2026-10', source: 'ACTUAL' })).rejects.toThrow('BUDGET_SOURCE_EMPTY')
  })
})

describe('budget and category changes', () => {
  it('should clear a month with its lines', async () => {
    const { foodId } = await setup()
    await setPlanned('2026-10', foodId, 60_000)
    await clearBudget('2026-10')
    expect([await prisma.budget.count(), await prisma.budgetLine.count()]).toEqual([0, 0])
  })

  it('should add the merged category\'s lines to the target', async () => {
    const { foodId, clothesId } = await setup()
    await setPlanned('2026-10', foodId, 60_000)
    await setPlanned('2026-10', clothesId, 10_000)
    await setPlanned('2026-11', clothesId, 5_000)
    await mergeCategory(clothesId, foodId)
    const lines = await prisma.budgetLine.findMany({ include: { budget: true }, orderBy: { budget: { month: 'asc' } } })
    expect(lines.map(l => [l.budget.month, l.categoryId, l.plannedCents])).toEqual([['2026-10', foodId, 70_000], ['2026-11', foodId, 5_000]])
  })

  it('should delete an unused category with its lines, and refuse carry-over on a group', async () => {
    const { foodId, spendId } = await setup()
    await setPlanned('2026-10', foodId, 60_000)
    await deleteCategory(foodId)
    expect(await prisma.budgetLine.count()).toBe(0)
    await expect(setCarryOver(spendId, true)).rejects.toThrow('CATEGORY_NOT_FOUND')
  })
})
