import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { createAccounts } from '../services/accounts'
import { createCategory } from '../services/categories'
import { createTransaction } from '../services/transactions'
import { setPlanned } from '../services/budgets'
import { createRule, markPaid } from '../services/recurring'
import {
  billProvider,
  budgetProvider,
  categoriseProvider,
  computeBillNotifications,
  computeImportStale,
  importProvider,
} from '../services/notification-providers'
import { collectNotifications, markNotifications, registerNotificationProvider } from '../services/notifications'
import { translator } from '../services/notification-toasts'
import type { RecurringRuleInput, UpcomingBill } from '../../shared/recurrence'

vi.mock('electron', () => ({ BrowserWindow: class {}, Notification: class {} }))

// Local 10:00 on 20 Oct 2026, so todayDateOnly() is that day in any time zone
const NOW = new Date(2026, 9, 20, 10)

async function setup() {
  const [bankId] = await createAccounts([
    { name: 'Alpha', kind: 'CURRENT', institutionId: 'inst_alpha', openingBalanceCents: 100_000, openingDate: '2026-01-01' },
  ])
  const billsGroup = await createCategory({ name: 'Λογαριασμοί', type: 'BILL' })
  const powerId = await createCategory({ name: 'Ρεύμα', parentId: billsGroup })
  const incomeGroup = await createCategory({ name: 'Έσοδα', type: 'INCOME' })
  const salaryId = await createCategory({ name: 'Μισθός', parentId: incomeGroup })
  const spendGroup = await createCategory({ name: 'Έξοδα', type: 'EXPENSE' })
  const foodId = await createCategory({ name: 'Σούπερ μάρκετ', parentId: spendGroup })
  await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: { notifyLeadDays: 3, notifyToasts: true } })
  return { bankId, powerId, salaryId, foodId }
}

const rule = (over: Partial<RecurringRuleInput> & Pick<RecurringRuleInput, 'categoryId'>): RecurringRuleInput => ({
  name: 'ΔΕΗ', amountCents: 8_000, amountVaries: false, accountId: null, memberId: null,
  frequency: 'MONTH', interval: 1, anchorDate: '2026-09-22', endsAt: null, matchText: null, remindDays: null,
  ...over,
})

/** Rules created "now" would treat older due dates as history; tests live in 2026 */
async function create(input: RecurringRuleInput): Promise<string> {
  const id = await createRule(input)
  await prisma.recurringRule.update({ where: { id }, data: { createdAt: new Date('2026-01-01T12:00:00Z') } })
  return id
}

/** A bank row as the statement import leaves it: no category */
const uncategorised = (accountId: string, amountCents: number, bookedAt: string) =>
  prisma.transaction.create({ data: { accountId, amountCents, bookedAt: new Date(`${bookedAt}T12:00:00Z`), description: 'POS' } })

const keys = (drafts: { key: string }[]) => drafts.map(d => d.key)

beforeEach(() => resetTestDb())

describe('bill provider', () => {
  it('should show a bill inside the household lead time, urgent on the day and overdue once past', async () => {
    const { powerId } = await setup()
    const id = await create(rule({ categoryId: powerId }))
    // Due 22 Oct: 2 days ahead, inside 3; September's 22nd is past and unpaid
    const drafts = await billProvider(NOW)
    expect(drafts.map(d => [d.key, d.kind, d.severity])).toEqual([
      [`bill:${id}:2026-09-22`, 'bill-overdue', 'urgent'],
      [`bill:${id}:2026-10-22`, 'bill-due', 'warning'],
    ])
    expect(drafts[1].params).toMatchObject({ name: 'ΔΕΗ', amountCents: -8_000, days: 2 })
    expect(drafts[1].actions[0]).toEqual({ kind: 'markPaid', ruleId: id, dueDate: '2026-10-22' })

    const onTheDay = await billProvider(new Date(2026, 9, 22, 10))
    expect(onTheDay.find(d => d.date === '2026-10-22')?.severity).toBe('urgent')
  })

  it('should follow a rule\'s own reminder over the household one, and drop paid dates', async () => {
    const { bankId, powerId } = await setup()
    await prisma.appSettings.update({ where: { id: 1 }, data: { notifyLeadDays: 0 } })
    const early = await create(rule({ name: 'Ασφάλεια', categoryId: powerId, anchorDate: '2026-09-26', remindDays: 7 }))
    const late = await create(rule({ name: 'Νερό', categoryId: powerId, anchorDate: '2026-09-26' }))
    // Pay last month's of both so only the coming ones are left
    for (const ruleId of [early, late]) {
      const tx = await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 8_000, bookedAt: '2026-09-26', categoryId: powerId, payee: 'x' })
      await markPaid({ ruleId, dueDate: '2026-09-26', transactionId: tx })
    }
    expect(keys(await billProvider(NOW))).toEqual([`bill:${early}:2026-10-26`])
  })

  it('should flag income only once its day passed with nothing booked', async () => {
    const { salaryId } = await setup()
    const id = await create(rule({ name: 'Μισθός', amountCents: 150_000, categoryId: salaryId, anchorDate: '2026-01-19' }))
    const drafts = await billProvider(NOW)
    expect(drafts.map(d => [d.key, d.kind])).toContainEqual([`income:${id}:2026-10-19`, 'income-late'])
    expect(drafts.some(d => d.kind === 'bill-due')).toBe(false)
  })
})

describe('budget, categorise and import providers', () => {
  it('should name a planned category spent past its plan this month, never an unplanned one', async () => {
    const { bankId, foodId, powerId } = await setup()
    await setPlanned('2026-10', foodId, 30_000)
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 32_500, bookedAt: '2026-10-05', categoryId: foodId })
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 5_000, bookedAt: '2026-10-05', categoryId: powerId })
    const drafts = await budgetProvider(NOW)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ key: `budget:2026-10:${foodId}`, kind: 'over-budget', params: { overCents: 2_500, availableCents: 30_000 } })
  })

  it('should key the categorise nudge by the newest row, so a new row brings a hidden one back', async () => {
    const { bankId } = await setup()
    expect(await categoriseProvider(NOW)).toEqual([])
    await uncategorised(bankId, -1_000, '2026-10-05')
    const [first] = await categoriseProvider(NOW)
    expect(first.params).toEqual({ count: 1 })
    await new Promise(r => setTimeout(r, 5))
    await uncategorised(bankId, -2_000, '2026-10-06')
    const [second] = await categoriseProvider(NOW)
    expect(second.params).toEqual({ count: 2 })
    expect(second.key).not.toBe(first.key)
  })

  it('should nudge an account whose last statement ends 30 days ago or more', async () => {
    const { bankId } = await setup()
    await prisma.importBatch.create({
      data: { accountId: bankId, fileName: 'a.csv', fileHash: 'h', dateFrom: new Date('2026-08-01T12:00:00Z'), dateTo: new Date('2026-09-15T12:00:00Z'), rowCount: 1, importedCount: 1, skippedCount: 0 },
    })
    const [stale] = await importProvider(NOW)
    expect(stale).toMatchObject({ kind: 'import-stale', params: { account: 'Alpha', days: 35 }, actions: [{ kind: 'importStatement', accountId: bankId }] })
    expect(computeImportStale([{ accountId: 'a', accountName: 'A', batchId: 'b', dateTo: '2026-09-21' }], '2026-10-20')).toEqual([])
  })
})

describe('collectNotifications', () => {
  it('should apply read and hidden marks, prune them when gone, and keep them when a provider fails', async () => {
    const live = [{ key: 'a', kind: 'to-categorise' as const, severity: 'info' as const, date: '2026-10-20', params: { count: 1 }, actions: [] }]
    let fail = false
    registerNotificationProvider(async () => { if (fail) throw new Error('boom'); return live })

    await markNotifications(['a'], 'readAt')
    await markNotifications(['gone'], 'dismissedAt')
    fail = true
    await collectNotifications(NOW)
    expect(await prisma.notificationState.count()).toBe(2)

    fail = false
    const [a] = await collectNotifications(NOW)
    expect(a).toMatchObject({ key: 'a', read: true, toasted: false })
    expect((await prisma.notificationState.findMany()).map(s => s.key)).toEqual(['a'])

    await markNotifications(['a'], 'dismissedAt')
    expect(await collectNotifications(NOW)).toEqual([])
  })
})

describe('toast translator', () => {
  it('should read dotted keys, plurals and params like i18next', () => {
    const t = translator({ n: { title: 'Hi {{name}}', rows_one: '{{count}} row', rows_other: '{{count}} rows' } })
    expect(t('n.title', { name: 'Ann' })).toBe('Hi Ann')
    expect(t('n.rows', { count: 1 })).toBe('1 row')
    expect(t('n.rows', { count: 3 })).toBe('3 rows')
    expect(t('n.missing')).toBe('n.missing')
  })
})

describe('computeBillNotifications', () => {
  const bill = (over: Partial<UpcomingBill>): UpcomingBill => ({
    ruleId: 'r', name: 'ΔΕΗ', categoryId: 'c', categoryType: 'BILL', frequency: 'MONTH', interval: 1, dueDate: '2026-10-25',
    amountCents: -8_000, amountVaries: false, remindDays: null, status: 'UPCOMING', transactionId: null, paidBy: null,
    transactionText: null, transactionDate: null, ...over,
  })

  it('should use the rule reminder when set, else the household one, and skip paid or skipped dates', () => {
    expect(computeBillNotifications([bill({})], '2026-10-20', 3)).toEqual([])
    expect(computeBillNotifications([bill({ remindDays: 5 })], '2026-10-20', 3)).toHaveLength(1)
    expect(computeBillNotifications([bill({ dueDate: '2026-10-10', status: 'PAID' })], '2026-10-20', 3)).toEqual([])
    expect(computeBillNotifications([bill({ dueDate: '2026-10-10', status: 'SKIPPED' })], '2026-10-20', 3)).toEqual([])
  })
})
