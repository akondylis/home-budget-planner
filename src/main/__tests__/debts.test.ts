import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { createAccounts } from '../services/accounts'
import { createCategory } from '../services/categories'
import { listRules, listUnpaid, markPaid, skipOccurrence, updateRule } from '../services/recurring'
import { computeBillNotifications } from '../services/notification-providers'
import {
  createDebt,
  debtPaymentCandidates,
  getDebt,
  linkDebtPayment,
  listDebts,
  recordDebtCash,
  setDebtArchived,
  setDebtBalance,
  updateDebt,
} from '../services/debts'
import type { DebtInput } from '../../shared/debt'

const TODAY = '2026-10-20'

async function setup() {
  const [bankId, cashId, cardId] = await createAccounts([
    { name: 'Alpha', kind: 'CURRENT', institutionId: 'inst_alpha', openingBalanceCents: 100_000, openingDate: '2026-01-01' },
    { name: 'Cash', kind: 'CASH', openingBalanceCents: 0, openingDate: '2026-01-01' },
    { name: 'Alpha Visa', kind: 'CREDIT_CARD', institutionId: 'inst_alpha', openingBalanceCents: 0, openingDate: '2026-01-01' },
  ])
  const debtGroup = await createCategory({ name: 'Χρέη', type: 'DEBT' })
  const loanId = await createCategory({ name: 'Δάνειο', parentId: debtGroup })
  return { bankId, cashId, cardId, loanId }
}

const loan = (over: Partial<DebtInput> = {}): DebtInput => ({
  name: 'Car loan',
  kind: 'LOAN',
  direction: 'WE_OWE',
  counterparty: null,
  institutionId: 'inst_alpha',
  principalCents: 1_000_000,
  rateBp: 600,
  termMonths: 36,
  instalmentCents: null,
  startDate: '2026-08-05',
  accountId: null,
  memberId: null,
  categoryId: null,
  matchText: 'ΔΟΣΗ ΔΑΝΕΙΟΥ',
  remindDays: null,
  note: null,
  ...over,
})

/** Debts made "now" would treat older instalments as history; tests live in 2026 */
async function create(input: DebtInput): Promise<string> {
  const id = await createDebt(input)
  const debt = await prisma.debt.findUniqueOrThrow({ where: { id } })
  if (debt.ruleId) await prisma.recurringRule.update({ where: { id: debt.ruleId }, data: { createdAt: new Date('2026-07-01T12:00:00Z') } })
  return id
}

const imported = (accountId: string, amountCents: number, bookedAt: string, description: string) =>
  prisma.transaction.create({ data: { accountId, amountCents, bookedAt: new Date(`${bookedAt}T12:00:00Z`), description } })

beforeEach(() => resetTestDb())

describe('a loan and its rule', () => {
  it('should work out the instalment and give the debt a monthly rule ending on the last instalment', async () => {
    const { loanId } = await setup()
    const id = await create(loan())
    const [row] = await listDebts(TODAY)
    expect(row).toMatchObject({ id, instalmentCents: 30_422, termMonths: 36, categoryId: loanId, remainingCents: 1_000_000, paidCount: 0 })
    const [rule] = await listRules(TODAY)
    expect(rule).toMatchObject({ debtId: id, amountCents: 30_422, frequency: 'MONTH', anchorDate: '2026-08-05', endsAt: '2029-07-05' })
  })

  it('should tick an instalment off with an imported row that matches, and lower the balance', async () => {
    const { bankId } = await setup()
    const id = await create(loan())
    await imported(bankId, -30_422, '2026-08-06', 'ΔΟΣΗ ΔΑΝΕΙΟΥ 123')
    const debt = await getDebt(id, TODAY)
    expect(debt.paidCount).toBe(1)
    expect(debt.schedule[0]).toMatchObject({ status: 'PAID', paidBy: 'AUTO' })
    expect(debt.remainingCents).toBe(1_000_000 + 5000 - 30_422)
    // September and October are still open
    expect(debt.nextDue).toMatchObject({ date: '2026-09-05', status: 'OVERDUE' })
  })

  it('should count an instalment marked by hand, and not one that was skipped', async () => {
    await setup()
    const id = await create(loan())
    const { ruleId } = await prisma.debt.findUniqueOrThrow({ where: { id } })
    await markPaid({ ruleId, dueDate: '2026-08-05', transactionId: null })
    await skipOccurrence({ ruleId, dueDate: '2026-09-05' })
    const debt = await getDebt(id, TODAY)
    expect(debt.paidCount).toBe(1)
    expect(debt.schedule[1].status).toBe('SKIPPED')
    expect(debt.remainingCents).toBe(1_000_000 + 5000 - 30_422)
  })

  it('should keep its rule out of the bills form and change it with the debt', async () => {
    const { loanId } = await setup()
    const id = await create(loan())
    const { ruleId } = await prisma.debt.findUniqueOrThrow({ where: { id } })
    await expect(updateRule(ruleId, {
      name: 'x', amountCents: 1, amountVaries: false, categoryId: loanId, accountId: null, memberId: null,
      frequency: 'MONTH', interval: 1, anchorDate: '2026-08-05', endsAt: null, matchText: null, remindDays: null,
    })).rejects.toThrow('DEBT_OWNED_RULE')
    await updateDebt(id, loan({ termMonths: 24 }))
    const rule = await prisma.recurringRule.findUniqueOrThrow({ where: { id: ruleId! } })
    expect(rule.amountCents).toBe(44_321)
  })

  it('should refuse an instalment that never covers the interest', async () => {
    await setup()
    await expect(createDebt(loan({ termMonths: null, instalmentCents: 4000 }))).rejects.toThrow('INSTALMENT_TOO_LOW')
  })

  it('should take the statement balance and apply only later payments to it', async () => {
    const { bankId } = await setup()
    const id = await create(loan())
    await imported(bankId, -30_422, '2026-08-05', 'ΔΟΣΗ ΔΑΝΕΙΟΥ')
    await setDebtBalance({ debtId: id, balanceCents: 900_000, date: '2026-08-31' })
    const debt = await getDebt(id, TODAY)
    expect(debt.remainingCents).toBe(900_000)
    expect(debt.balanceOverride).toEqual({ cents: 900_000, date: '2026-08-31' })
  })

  it('should take an extra payment straight off the balance and bring the payoff closer', async () => {
    const { bankId } = await setup()
    const id = await create(loan())
    const before = (await getDebt(id, TODAY)).payoffDate!
    const row = await imported(bankId, -200_000, '2026-10-10', 'ΕΞΟΦΛΗΣΗ ΜΕΡΙΚΗ')
    expect((await debtPaymentCandidates(id, TODAY)).map(c => c.id)).toContain(row.id)
    await linkDebtPayment({ debtId: id, transactionId: row.id })
    const after = await getDebt(id, TODAY)
    expect(after.remainingCents).toBe(800_000)
    expect(after.payoffDate! < before).toBe(true)
    await expect(linkDebtPayment({ debtId: id, transactionId: row.id })).rejects.toThrow('PAYMENT_ALREADY_LINKED')
  })

  it('should keep the balance of an archived debt', async () => {
    const { bankId } = await setup()
    const id = await create(loan())
    await imported(bankId, -30_422, '2026-08-05', 'ΔΟΣΗ ΔΑΝΕΙΟΥ')
    await setDebtArchived(id, true)
    const [row] = await listDebts(TODAY)
    expect(row).toMatchObject({ archived: true, paidCount: 1 })
    expect((await listRules(TODAY))[0].archived).toBe(true)
  })
})

describe('card instalments and personal debts', () => {
  it('should split card instalments without interest on the card', async () => {
    const { cardId } = await setup()
    await create(loan({ name: 'Πλυντήριο', kind: 'INSTALMENTS', institutionId: 'inst_alpha', principalCents: 100_000, rateBp: 900, termMonths: 24, accountId: cardId }))
    const [row] = await listDebts(TODAY)
    expect(row).toMatchObject({ rateBp: 0, instalmentCents: 4167, institutionId: null, accountId: cardId })
  })

  it('should track money owed to us with no rule, from linked rows and cash received', async () => {
    const { bankId, cashId } = await setup()
    const id = await createDebt(loan({ name: 'Νίκος', kind: 'PERSONAL', direction: 'OWED_TO_US', counterparty: 'Νίκος', principalCents: 50_000, rateBp: 0, termMonths: 5 }))
    const debt = await prisma.debt.findUniqueOrThrow({ where: { id } })
    expect(debt).toMatchObject({ ruleId: null, termMonths: null, instalmentCents: null, institutionId: null })
    const row = await imported(bankId, 20_000, '2026-10-01', 'ΜΕΤΑΦΟΡΑ ΑΠΟ ΝΙΚΟΣ')
    const candidates = await debtPaymentCandidates(id, TODAY)
    expect(candidates[0]).toMatchObject({ id: row.id, likely: true })
    await linkDebtPayment({ debtId: id, transactionId: row.id })
    const cashRow = await recordDebtCash({ debtId: id, accountId: cashId, bookedAt: '2026-10-15', amountCents: 10_000 })
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: cashRow } })).amountCents).toBe(10_000)
    const detail = await getDebt(id, TODAY)
    expect(detail.remainingCents).toBe(20_000)
    expect(detail.payments).toHaveLength(2)
  })
})

describe('the bell', () => {
  it('should call a due debt rule an instalment, with its number and a way to the debt', async () => {
    await setup()
    const id = await create(loan({ startDate: '2026-10-22' }))
    const bills = await listUnpaid(30, TODAY)
    const [n] = computeBillNotifications(bills, TODAY, 3)
    expect(n).toMatchObject({ kind: 'instalment-due', params: { n: 1, of: 36 } })
    expect(n.actions).toContainEqual({ kind: 'openDebt', debtId: id })
  })
})
