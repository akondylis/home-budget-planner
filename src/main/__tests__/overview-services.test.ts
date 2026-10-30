import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { createAccounts } from '../services/accounts'
import { createCategory } from '../services/categories'
import { createTransaction, createTransfer } from '../services/transactions'
import { setPlanned } from '../services/budgets'
import { countOwnCategories, getOverview } from '../services/overview'

async function setup() {
  const [bankId, savingsId] = await createAccounts([
    { name: 'Alpha', kind: 'CURRENT', institutionId: 'inst_alpha', openingBalanceCents: 100_000, openingDate: '2026-08-01' },
    { name: 'Savings', kind: 'SAVINGS', institutionId: 'inst_alpha', openingBalanceCents: 0, openingDate: '2026-08-01' },
  ])
  const incomeId = await createCategory({ name: 'Έσοδα', type: 'INCOME' })
  const salaryId = await createCategory({ name: 'Μισθός', parentId: incomeId })
  const spendId = await createCategory({ name: 'Έξοδα', type: 'EXPENSE' })
  const foodId = await createCategory({ name: 'Σούπερ μάρκετ', parentId: spendId })
  return { bankId, savingsId, salaryId, foodId }
}

beforeEach(() => resetTestDb())

describe('getOverview', () => {
  it('should count every income and expense row of the month, uncategorised included, transfers left out', async () => {
    const { bankId, savingsId, salaryId, foodId } = await setup()
    await createTransaction({ kind: 'INCOME', accountId: bankId, amountCents: 300_000, bookedAt: '2026-10-01', categoryId: salaryId })
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 20_000, bookedAt: '2026-10-02', categoryId: foodId })
    // An imported row still to categorise (the entry form always asks for a category)
    await prisma.transaction.create({ data: { accountId: bankId, amountCents: -5_000, bookedAt: new Date('2026-10-03T12:00:00Z') } })
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 9_900, bookedAt: '2026-09-30', categoryId: foodId })
    await createTransfer({ fromAccountId: bankId, toAccountId: savingsId, amountCents: 50_000, bookedAt: '2026-10-04' })

    const o = await getOverview('2026-10')
    expect(o).toMatchObject({ month: '2026-10', incomeCents: 300_000, spentCents: 25_000 })
    expect(o.budget.uncategorisedCount).toBe(1)
  })

  it('should give 0 (not −0) for an empty month and say there is no plan', async () => {
    await setup()
    const o = await getOverview('2026-10')
    expect(Object.is(o.spentCents, 0)).toBe(true)
    expect(o.incomeCents).toBe(0)
    expect(o.budget.exists).toBe(false)
  })

  it('should carry the month plan, so over-budget categories can be named', async () => {
    const { bankId, foodId } = await setup()
    await setPlanned('2026-10', foodId, 10_000)
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 14_200, bookedAt: '2026-10-02', categoryId: foodId })

    const o = await getOverview('2026-10')
    expect(o.budget.exists).toBe(true)
    expect(o.budget.summary.leftToSpendCents).toBe(-4_200)
  })

  it('should reject a malformed month', async () => {
    await expect(getOverview('2026-13')).rejects.toThrow('INVALID_INPUT')
  })
})

describe('countOwnCategories', () => {
  it('should leave out the starter list and count only categories created after it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-01T09:00:00Z'))
      const groupId = await createCategory({ name: 'Έξοδα', type: 'EXPENSE' })
      await createCategory({ name: 'Σούπερ μάρκετ', parentId: groupId })
      expect(await countOwnCategories()).toBe(0)

      vi.setSystemTime(new Date('2026-10-05T18:00:00Z'))
      await createCategory({ name: 'Κουπόνια σίτισης', type: 'INCOME' })
      expect(await countOwnCategories()).toBe(0)
      await createCategory({ name: 'Μαθήματα πιάνου', parentId: groupId })
      expect(await countOwnCategories()).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
