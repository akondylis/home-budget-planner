import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { createAccounts } from '../services/accounts'
import { createCategory, deleteCategory, mergeCategory } from '../services/categories'
import { createTransaction, deleteTransaction } from '../services/transactions'
import { copyBudget, getBudgetMonth } from '../services/budgets'
import { listSubscriptionHints } from '../services/subscriptions'
import {
  countMatches,
  createRule,
  listOccurrences,
  listRules,
  listUnpaid,
  markPaid,
  payInCash,
  paymentCandidates,
  setRuleArchived,
  skipOccurrence,
  unmarkOccurrence,
  updateRule,
} from '../services/recurring'
import type { RecurringRuleInput } from '../../shared/recurrence'

async function setup() {
  const [bankId, cashId] = await createAccounts([
    { name: 'Alpha', kind: 'CURRENT', institutionId: 'inst_alpha', openingBalanceCents: 100_000, openingDate: '2026-01-01' },
    { name: 'Cash', kind: 'CASH', openingBalanceCents: 0, openingDate: '2026-01-01' },
  ])
  const subsGroup = await createCategory({ name: 'Συνδρομές', type: 'SUBSCRIPTION' })
  const streamingId = await createCategory({ name: 'Streaming', parentId: subsGroup })
  const billsGroup = await createCategory({ name: 'Λογαριασμοί', type: 'BILL' })
  const insuranceId = await createCategory({ name: 'Ασφάλεια αυτοκινήτου', parentId: billsGroup })
  const powerId = await createCategory({ name: 'Ρεύμα', parentId: billsGroup })
  return { bankId, cashId, streamingId, insuranceId, powerId, billsGroup }
}

const rule = (over: Partial<RecurringRuleInput> & Pick<RecurringRuleInput, 'categoryId'>): RecurringRuleInput => ({
  name: 'Netflix',
  amountCents: 1_299,
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

/** Rules created "now" would treat older due dates as history; tests live in 2026 */
async function create(input: RecurringRuleInput): Promise<string> {
  const id = await createRule(input)
  await prisma.recurringRule.update({ where: { id }, data: { createdAt: new Date('2026-01-01T12:00:00Z') } })
  return id
}

/** A bank row as the statement import leaves it: bank text, no payee, no category */
const imported = (accountId: string, amountCents: number, bookedAt: string, description: string) =>
  prisma.transaction.create({ data: { accountId, amountCents, bookedAt: new Date(`${bookedAt}T12:00:00Z`), description } })

const OCT = { from: '2026-10-01', to: '2026-10-31' }
const TODAY = '2026-10-20'

beforeEach(() => resetTestDb())

describe('rules', () => {
  it('should create, list with monthly cost and next due, update and archive a rule', async () => {
    const { insuranceId } = await setup()
    const id = await create(rule({ name: 'Car insurance', amountCents: 48_000, frequency: 'YEAR', anchorDate: '2026-03-15', categoryId: insuranceId }))
    let [row] = await listRules(TODAY)
    expect(row).toMatchObject({ name: 'Car insurance', monthlyCents: 4_000, nextDue: '2027-03-15', categoryType: 'BILL', archived: false })

    await updateRule(id, rule({ name: 'Car insurance', amountCents: 24_000, frequency: 'MONTH', interval: 6, anchorDate: '2026-03-15', categoryId: insuranceId }))
    ;[row] = await listRules(TODAY)
    expect(row).toMatchObject({ monthlyCents: 4_000, nextDue: '2027-03-15' })

    await setRuleArchived(id, true)
    expect((await listRules(TODAY))[0].archived).toBe(true)
    expect(await listOccurrences({ from: '2026-01-01', to: '2027-12-31' }, TODAY)).toEqual([])
  })

  it('should refuse a group, an end before the start, a zero amount and an unknown account', async () => {
    const { streamingId, billsGroup } = await setup()
    await expect(createRule(rule({ categoryId: billsGroup }))).rejects.toThrow('CATEGORY_NOT_FOUND')
    await expect(createRule(rule({ categoryId: streamingId, endsAt: '2025-12-31' }))).rejects.toThrow('INVALID_INPUT')
    await expect(createRule(rule({ categoryId: streamingId, amountCents: 0 }))).rejects.toThrow('INVALID_INPUT')
    await expect(createRule(rule({ categoryId: streamingId, accountId: 'nope' }))).rejects.toThrow('ACCOUNT_NOT_FOUND')
  })

  it('should keep a category with bills from being deleted and move its bills on merge', async () => {
    const { streamingId, powerId } = await setup()
    await create(rule({ categoryId: streamingId }))
    await expect(deleteCategory(streamingId)).rejects.toThrow('CATEGORY_IN_USE')
    await mergeCategory(streamingId, powerId)
    expect((await listRules(TODAY))[0].categoryId).toBe(powerId)
  })
})

describe('due dates and payments', () => {
  it('should mark a due date paid by an imported row that matches, with no hand action', async () => {
    const { bankId, streamingId } = await setup()
    await create(rule({ categoryId: streamingId }))
    const row = await imported(bankId, -1_299, '2026-10-07', 'POS NETFLIX.COM 4411')
    const [bill] = await listOccurrences(OCT, TODAY)
    expect(bill).toMatchObject({ dueDate: '2026-10-05', amountCents: -1_299, status: 'PAID', paidBy: 'AUTO', transactionId: row.id })
  })

  it('should leave a due date overdue when the amount is far off, unless the amount varies', async () => {
    const { bankId, powerId } = await setup()
    await imported(bankId, -9_000, '2026-10-05', 'DEI ΡΕΥΜΑ')
    const id = await create(rule({ name: 'ΔΕΗ', matchText: 'DEI', amountCents: 6_000, categoryId: powerId }))
    expect((await listOccurrences(OCT, TODAY))[0].status).toBe('OVERDUE')
    await updateRule(id, rule({ name: 'ΔΕΗ', matchText: 'DEI', amountCents: 6_000, amountVaries: true, categoryId: powerId }))
    expect((await listOccurrences(OCT, TODAY))[0].status).toBe('PAID')
  })

  it('should link a row by hand, refuse it for a second due date, and free it when the row is deleted', async () => {
    const { bankId, streamingId } = await setup()
    const ruleId = await create(rule({ categoryId: streamingId }))
    const rowId = await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 1_500, bookedAt: '2026-10-18', categoryId: streamingId, payee: 'Card payment' })

    const [candidate] = await paymentCandidates({ ruleId, dueDate: '2026-10-05' })
    expect(candidate).toMatchObject({ id: rowId, likely: false, accountName: 'Alpha' })
    await markPaid({ ruleId, dueDate: '2026-10-05', transactionId: rowId })
    expect((await listOccurrences(OCT, TODAY))[0]).toMatchObject({ status: 'PAID', paidBy: 'HAND', transactionId: rowId })
    await expect(markPaid({ ruleId, dueDate: '2026-11-05', transactionId: rowId })).rejects.toThrow('TRANSACTION_ALREADY_LINKED')
    expect(await paymentCandidates({ ruleId, dueDate: '2026-10-05' })).toEqual([])

    await deleteTransaction(rowId)
    expect((await listOccurrences(OCT, TODAY))[0].status).toBe('OVERDUE')
  })

  it('should not offer a row another bill already matched', async () => {
    const { bankId, streamingId, powerId } = await setup()
    await create(rule({ categoryId: streamingId }))
    const powerRule = await create(rule({ name: 'ΔΕΗ', matchText: 'DEI', amountCents: 9_000, categoryId: powerId }))
    await imported(bankId, -1_299, '2026-10-06', 'POS NETFLIX.COM 4411')
    expect(await paymentCandidates({ ruleId: powerRule, dueDate: '2026-10-05' })).toEqual([])
  })

  it('should refuse a date that is not a due date of the rule', async () => {
    const { streamingId } = await setup()
    const ruleId = await create(rule({ categoryId: streamingId }))
    await expect(skipOccurrence({ ruleId, dueDate: '2026-10-06' })).rejects.toThrow('INVALID_DATE')
  })

  it('should add the cash row with the rule category and payee, and mark the due date with it', async () => {
    const { cashId, powerId } = await setup()
    const ruleId = await create(rule({ name: 'Κηπουρός', amountCents: 4_000, categoryId: powerId }))
    const rowId = await payInCash({ ruleId, dueDate: '2026-10-05', accountId: cashId, bookedAt: '2026-10-06', amountCents: 4_000 })
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id: rowId } })
    expect(row).toMatchObject({ amountCents: -4_000, categoryId: powerId, payee: 'Κηπουρός', accountId: cashId })
    expect((await listOccurrences(OCT, TODAY))[0]).toMatchObject({ status: 'PAID', transactionId: rowId })
  })

  it('should skip a due date and take the mark back', async () => {
    const { streamingId } = await setup()
    const ruleId = await create(rule({ categoryId: streamingId }))
    await skipOccurrence({ ruleId, dueDate: '2026-10-05' })
    expect((await listOccurrences(OCT, TODAY))[0].status).toBe('SKIPPED')
    expect((await listUnpaid(14, TODAY)).map(b => b.dueDate)).toEqual(['2026-08-05', '2026-09-05'])
    await unmarkOccurrence({ ruleId, dueDate: '2026-10-05' })
    expect((await listOccurrences(OCT, TODAY))[0].status).toBe('OVERDUE')
  })

  it('should not call due dates long before the rule was created overdue', async () => {
    const { streamingId } = await setup()
    await createRule(rule({ categoryId: streamingId, anchorDate: '2020-01-05' }))
    const bills = await listOccurrences({ from: '2020-01-01', to: '2020-12-31' }, '2020-12-31')
    expect(bills).toEqual([])
  })

  it('should count the bank rows the text would match', async () => {
    const { bankId } = await setup()
    await imported(bankId, -1_299, '2026-10-07', 'POS NETFLIX.COM 4411')
    await imported(bankId, -1_299, '2026-09-07', 'POS NETFLIX.COM 4411')
    expect(await countMatches({ matchText: 'netflix' }, TODAY)).toBe(2)
    expect(await countMatches({ matchText: '  ' }, TODAY)).toBe(0)
  })
})

describe('budget and hints', () => {
  it('should offer the monthly cost as the plan and fill only empty lines from it', async () => {
    const { insuranceId, streamingId } = await setup()
    await create(rule({ name: 'Car insurance', amountCents: 48_000, frequency: 'YEAR', anchorDate: '2026-03-15', categoryId: insuranceId }))
    await create(rule({ categoryId: streamingId }))
    const b = await getBudgetMonth('2026-11')
    const row = (id: string) => b.groups.flatMap(g => g.categories).find(c => c.id === id)!
    expect(row(insuranceId).suggestedCents).toBe(4_000)
    expect(row(streamingId).suggestedCents).toBe(1_299)

    const { setPlanned } = await import('../services/budgets')
    await setPlanned('2026-11', streamingId, 2_000)
    expect(await copyBudget({ from: '2026-10', to: '2026-11', source: 'RULES' })).toBe(1)
    const after = (await getBudgetMonth('2026-11')).groups.flatMap(g => g.categories)
    expect(after.find(c => c.id === insuranceId)!.plannedCents).toBe(4_000)
    expect(after.find(c => c.id === streamingId)!.plannedCents).toBe(2_000)
  })

  it('should stop suggesting a subscription a rule already tracks', async () => {
    const { bankId, streamingId } = await setup()
    for (const d of ['2026-07-07', '2026-08-07', '2026-09-07', '2026-10-07']) await imported(bankId, -1_299, d, 'POS NETFLIX.COM 4411')
    expect(await listSubscriptionHints(TODAY)).toHaveLength(1)
    await create(rule({ categoryId: streamingId }))
    expect(await listSubscriptionHints(TODAY)).toEqual([])
  })
})
