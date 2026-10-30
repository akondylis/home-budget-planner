import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { createAccounts } from '../services/accounts'
import { archiveCategory, createCategory } from '../services/categories'
import { createTransaction, createTransfer } from '../services/transactions'
import { createRule, setRuleArchived } from '../services/recurring'
import { createDebt } from '../services/debts'
import { setPlanned } from '../services/budgets'
import { getProjection } from '../services/projections'
import type { RecurringRuleInput } from '../../shared/recurrence'

const TODAY = '2026-10-20'

async function setup() {
  const [bankId, savingsId, voucherId] = await createAccounts([
    { name: 'Alpha', kind: 'CURRENT', institutionId: 'inst_alpha', openingBalanceCents: 100_000, openingDate: '2026-01-01' },
    { name: 'Savings', kind: 'SAVINGS', institutionId: 'inst_alpha', openingBalanceCents: 50_000, openingDate: '2026-01-01' },
    { name: 'Edenred', kind: 'MEAL_VOUCHER', openingBalanceCents: 20_000, openingDate: '2026-01-01' },
  ])
  const incomeGroup = await createCategory({ name: 'Μισθοί', type: 'INCOME' })
  const salaryId = await createCategory({ name: 'Μισθός', parentId: incomeGroup })
  const billGroup = await createCategory({ name: 'Λογαριασμοί', type: 'BILL' })
  const powerId = await createCategory({ name: 'Ρεύμα', parentId: billGroup })
  const spendGroup = await createCategory({ name: 'Έξοδα', type: 'EXPENSE' })
  const foodId = await createCategory({ name: 'Σούπερ μάρκετ', parentId: spendGroup })
  const debtGroup = await createCategory({ name: 'Χρέη', type: 'DEBT' })
  const loanId = await createCategory({ name: 'Δάνειο', parentId: debtGroup })
  return { bankId, savingsId, voucherId, salaryId, powerId, foodId, loanId }
}

const rule = (over: Partial<RecurringRuleInput> & Pick<RecurringRuleInput, 'categoryId'>): RecurringRuleInput => ({
  name: 'Rule',
  amountCents: 10_000,
  amountVaries: false,
  accountId: null,
  memberId: null,
  frequency: 'MONTH',
  interval: 1,
  anchorDate: '2026-01-05',
  endsAt: null,
  matchText: null,
  remindDays: null,
  ...over,
})

beforeEach(() => resetTestDb())

describe('getProjection', () => {
  it('should start from the money in accounts, vouchers apart, and ignore transfers', async () => {
    const { bankId, savingsId } = await setup()
    await createTransfer({ fromAccountId: bankId, toAccountId: savingsId, amountCents: 30_000, bookedAt: '2026-10-10' })
    const p = await getProjection(12, TODAY)
    expect(p.startCents).toBe(150_000)
    expect(p.months).toHaveLength(12)
    expect(p.months[0].month).toBe('2026-10')
    expect(p.endCents).toBe(150_000)
  })

  it('should add income and bills on their dates and repeat the latest plan', async () => {
    const { bankId, salaryId, powerId, foodId } = await setup()
    await createRule(rule({ name: 'Salary', categoryId: salaryId, amountCents: 200_000, anchorDate: '2026-01-25' }))
    await createRule(rule({ name: 'Power', categoryId: powerId, amountCents: 9_000, anchorDate: '2026-01-10' }))
    await setPlanned('2026-10', foodId, 50_000)
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 9_000, bookedAt: '2026-10-10', categoryId: powerId })
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 20_000, bookedAt: '2026-10-12', categoryId: foodId })

    const p = await getProjection(6, TODAY)
    // Start: 150k − 29k booked; still to come in October: salary 200k, food 30k (power paid)
    expect(p.startCents).toBe(121_000)
    expect(p.months[0]).toMatchObject({ inCents: 200_000, outCents: 30_000, endCents: 291_000 })
    expect(p.months[1]).toMatchObject({ inCents: 200_000, outCents: 59_000, planMonth: '2026-10' })
    expect(p.months[1].lines.find(l => l.categoryId === powerId)).toMatchObject({ source: 'RULES', ruleNames: ['Power'] })
  })

  it('should count a debt instalment and leave archived rules and categories out', async () => {
    const { powerId, foodId, loanId } = await setup()
    await createDebt({
      name: 'Car loan', kind: 'LOAN', direction: 'WE_OWE', counterparty: null, institutionId: 'inst_alpha', principalCents: 1_000_000, rateBp: 600,
      termMonths: 36, instalmentCents: null, startDate: '2026-11-05', accountId: null, memberId: null, categoryId: loanId, matchText: null, remindDays: null, note: null,
    })
    const debt = await prisma.debt.findFirstOrThrow()
    const instalment = (await prisma.recurringRule.findUniqueOrThrow({ where: { id: debt.ruleId! } })).amountCents
    const archived = await createRule(rule({ name: 'Old', categoryId: powerId }))
    await setRuleArchived(archived, true)
    await setPlanned('2026-11', foodId, 40_000)
    await archiveCategory(foodId)

    const p = await getProjection(6, TODAY)
    expect(p.months[1].lines.map(l => [l.categoryId, l.amountCents])).toEqual([[loanId, 0 - instalment]])
  })

  it('should refuse a horizon that is not 6, 12 or 24', async () => {
    await setup()
    await expect(getProjection(7, TODAY)).rejects.toThrow('INVALID_INPUT')
    await expect(getProjection('12', TODAY)).rejects.toThrow('INVALID_INPUT')
  })
})
