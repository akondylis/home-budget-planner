import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { archiveAccount, createAccounts } from '../services/accounts'
import { createCategory } from '../services/categories'
import { createMember } from '../services/members'
import { createTransaction, createTransfer, listTransactions } from '../services/transactions'
import { balanceReport, categoryReport, memberReport, trendReport } from '../services/reports'
import { HOUSEHOLD } from '../../shared/members'

const YEAR = { from: '2026-01-01', to: '2026-12-31' }

async function setup() {
  const [bankId, savingsId, voucherId] = await createAccounts([
    { name: 'Alpha', kind: 'CURRENT', institutionId: 'inst_alpha', openingBalanceCents: 100_000, openingDate: '2025-01-01' },
    { name: 'Savings', kind: 'SAVINGS', institutionId: 'inst_alpha', openingBalanceCents: 0, openingDate: '2025-01-01' },
    { name: 'Edenred', kind: 'MEAL_VOUCHER', openingBalanceCents: 5_000, openingDate: '2025-01-01' },
  ])
  const incomeGroup = await createCategory({ name: 'Μισθοί', type: 'INCOME' })
  const salaryId = await createCategory({ name: 'Μισθός', parentId: incomeGroup })
  const spendGroup = await createCategory({ name: 'Έξοδα', type: 'EXPENSE' })
  const foodId = await createCategory({ name: 'Σούπερ μάρκετ', parentId: spendGroup })
  const clothesId = await createCategory({ name: 'Ρούχα', parentId: spendGroup })
  const anna = await createMember({ name: 'Άννα', colour: 'blue' })
  return { bankId, savingsId, voucherId, salaryId, spendGroup, foodId, clothesId, anna }
}

const expense = (accountId: string, categoryId: string, amountCents: number, bookedAt: string, memberId: string | null = null) =>
  createTransaction({ kind: 'EXPENSE', accountId, amountCents, bookedAt, categoryId, memberId })

beforeEach(() => resetTestDb())

describe('categoryReport', () => {
  it('should rank spending, lower a category by its refund, leave transfers out and list rows with no category', async () => {
    const { bankId, savingsId, foodId, clothesId } = await setup()
    await expense(bankId, foodId, 30_000, '2026-03-05')
    await createTransaction({ kind: 'INCOME', accountId: bankId, amountCents: 5_000, bookedAt: '2026-03-06', categoryId: foodId })
    await expense(bankId, clothesId, 40_000, '2026-04-05')
    await prisma.transaction.create({ data: { accountId: bankId, amountCents: -2_000, bookedAt: new Date('2026-04-06T12:00:00Z') } })
    await createTransfer({ fromAccountId: bankId, toAccountId: savingsId, amountCents: 50_000, bookedAt: '2026-04-07' })
    await expense(bankId, foodId, 9_000, '2025-03-05')

    const r = await categoryReport({ range: YEAR, compare: 'LAST_YEAR', direction: 'OUT', level: 'CATEGORY' })
    expect(r.rows.map(row => [row.id, row.cents, row.compareCents])).toEqual([[clothesId, 40_000, 0], [foodId, 25_000, 9_000], [null, 2_000, 0]])
    expect([r.totalCents, r.compareTotalCents]).toEqual([67_000, 9_000])
    expect(r.rows[1].groupName).toBe('Έξοδα')
  })

  it('should sum categories into their group and show income on its own', async () => {
    const { bankId, salaryId, spendGroup, foodId, clothesId } = await setup()
    await expense(bankId, foodId, 30_000, '2026-03-05')
    await expense(bankId, clothesId, 10_000, '2026-03-05')
    await createTransaction({ kind: 'INCOME', accountId: bankId, amountCents: 200_000, bookedAt: '2026-03-01', categoryId: salaryId })
    const groups = await categoryReport({ range: YEAR, compare: 'NONE', direction: 'OUT', level: 'GROUP' })
    expect(groups.rows).toEqual([{ id: spendGroup, name: 'Έξοδα', groupName: null, cents: 40_000, compareCents: null }])
    const income = await categoryReport({ range: YEAR, compare: 'NONE', direction: 'IN', level: 'CATEGORY' })
    expect(income.rows.map(row => [row.id, row.cents])).toEqual([[salaryId, 200_000]])
  })

  it('should refuse a range that ends before it starts', async () => {
    await setup()
    await expect(categoryReport({ range: { from: '2026-05-01', to: '2026-04-01' }, compare: 'NONE', direction: 'OUT', level: 'CATEGORY' })).rejects.toThrow('INVALID_INPUT')
  })
})

describe('trendReport', () => {
  it('should give in, out and net per month without transfers, cut to the period', async () => {
    const { bankId, savingsId, salaryId, foodId } = await setup()
    await createTransaction({ kind: 'INCOME', accountId: bankId, amountCents: 200_000, bookedAt: '2026-01-25', categoryId: salaryId })
    await expense(bankId, foodId, 30_000, '2026-01-10')
    await expense(bankId, foodId, 1_000, '2026-02-02')
    await createTransfer({ fromAccountId: bankId, toAccountId: savingsId, amountCents: 50_000, bookedAt: '2026-01-11' })
    const t = await trendReport({ range: { from: '2026-01-05', to: '2026-02-10' } })
    expect(t.by).toBe('MONTH')
    expect(t.rows.map(r => [r.key, r.inCents, r.outCents, r.netCents, r.count])).toEqual([['2026-01', 200_000, 30_000, 170_000, 2], ['2026-02', 0, 1_000, -1_000, 1]])
    expect(t.rows.map(r => r.range)).toEqual([{ from: '2026-01-05', to: '2026-01-31' }, { from: '2026-02-01', to: '2026-02-10' }])
  })

  it('should group into quarters past 24 months', async () => {
    await setup()
    const t = await trendReport({ range: { from: '2024-01-01', to: '2026-12-31' } })
    expect([t.by, t.rows.length, t.rows[0].key]).toEqual(['QUARTER', 12, '2024-Q1'])
  })
})

describe('memberReport', () => {
  it('should split spending by For, Household for none, with top categories and a comparison', async () => {
    const { bankId, foodId, clothesId, anna } = await setup()
    await expense(bankId, clothesId, 40_000, '2026-02-05', anna)
    await expense(bankId, foodId, 10_000, '2026-02-06', anna)
    await expense(bankId, foodId, 30_000, '2026-02-07')
    await expense(bankId, foodId, 5_000, '2025-02-07', anna)
    const r = await memberReport({ range: YEAR, compare: 'LAST_YEAR' })
    expect(r.rows.map(row => [row.id, row.name, row.cents, row.compareCents])).toEqual([[anna, 'Άννα', 50_000, 5_000], [HOUSEHOLD, null, 30_000, 0]])
    expect(r.rows[0].top.map(c => [c.id, c.cents])).toEqual([[clothesId, 40_000], [foodId, 10_000]])
    expect(r.totalCents).toBe(80_000)
  })
})

describe('balanceReport', () => {
  it('should run month-end totals without vouchers, and keep an archived account only while it held money', async () => {
    const { bankId, savingsId, voucherId, foodId } = await setup()
    await expense(bankId, foodId, 10_000, '2025-12-10')
    await expense(bankId, foodId, 20_000, '2026-01-10')
    await createTransfer({ fromAccountId: bankId, toAccountId: savingsId, amountCents: 30_000, bookedAt: '2026-02-01' })
    await expense(voucherId, foodId, 1_000, '2026-01-12')
    const [oldId] = await createAccounts([{ name: 'Old', kind: 'CURRENT', openingBalanceCents: 0, openingDate: '2025-01-01' }])
    await archiveAccount(oldId)

    const b = await balanceReport({ range: { from: '2026-01-01', to: '2026-03-31' } })
    expect(b.startCents).toBe(90_000)
    expect(b.points).toEqual([{ month: '2026-01', cents: 70_000 }, { month: '2026-02', cents: 70_000 }, { month: '2026-03', cents: 70_000 }])
    expect(b.accounts.map(a => [a.name, a.startCents, a.endCents, a.spendable])).toEqual([
      ['Alpha', 90_000, 40_000, true],
      ['Savings', 0, 30_000, true],
      ['Edenred', 5_000, 4_000, false],
    ])
  })
})

describe('log range filter', () => {
  it('should list the rows between two days, both included', async () => {
    const { bankId, foodId } = await setup()
    await expense(bankId, foodId, 1_000, '2026-01-31')
    await expense(bankId, foodId, 2_000, '2026-02-01')
    await expense(bankId, foodId, 3_000, '2026-02-28')
    await expense(bankId, foodId, 4_000, '2026-03-01')
    const page = await listTransactions({ from: '2026-02-01', to: '2026-02-28', categoryId: foodId })
    expect(page.rows.map(r => r.amountCents).sort((a, b) => a - b)).toEqual([-3_000, -2_000])
  })
})
