// Debts & loans (roadmap #9). A debt with instalments owns a monthly recurring rule, so a typed
// or imported row that matches ticks an instalment off, and Mark as paid, Skip and the bell work
// as for bills (decided 2026-10-30). Extra payments, and payments of a personal debt with no
// schedule, are rows linked by `Transaction.debtId`. The balance is computed on read, never stored.

import { z } from 'zod'
import { prisma } from '../db/prisma'
import type { Prisma } from '../../../prisma/generated/client/client'
import { addDays, dateOnlyToDate, dateToDateOnly, isDateOnly, todayDateOnly } from '../../shared/date-only'
import { payeeKey } from '../../shared/payee-key'
import { nextDue as nextScheduledDue, occurrenceStatus, type CandidateRow, type UpcomingBill } from '../../shared/recurrence'
import { NOTIFY_LEAD_DAYS_MAX } from '../../shared/notifications'
import {
  DEBT_DIRECTIONS,
  DEBT_KINDS,
  MAX_DEBT_MONTHS,
  MAX_RATE_BP,
  amortisationSchedule,
  annuityInstalment,
  projectPayoff,
  remainingBalance,
  termFromInstalment,
  type DebtDetail,
  type DebtPayment,
  type DebtPaymentRow,
  type DebtRow,
  type ScheduleRowWithStatus,
} from '../../shared/debt'
import { HISTORY_GRACE_DAYS, assertRuleRefs, listOccurrences } from './recurring'
import { createTransaction } from './transactions'

/** How far ahead the list looks for the next instalment */
const NEXT_DUE_DAYS = 62
/** How far back "Record payment" offers rows */
const CANDIDATE_DAYS = 120
const CANDIDATE_LIMIT = 50

const dateOnly = z.string().refine(isDateOnly)
const text = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null)
const optionalId = z.string().nullish().transform(v => v || null)

const debtInput = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(DEBT_KINDS),
  direction: z.enum(DEBT_DIRECTIONS).default('WE_OWE'),
  counterparty: text(120),
  institutionId: optionalId,
  principalCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  rateBp: z.number().int().min(0).max(MAX_RATE_BP).default(0),
  termMonths: z.number().int().min(1).max(MAX_DEBT_MONTHS).nullish().transform(v => v ?? null),
  instalmentCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullish().transform(v => v ?? null),
  startDate: dateOnly,
  accountId: optionalId,
  memberId: optionalId,
  categoryId: optionalId,
  matchText: text(120),
  remindDays: z.number().int().min(0).max(NOTIFY_LEAD_DAYS_MAX).nullish().transform(v => v ?? null),
  note: text(500),
})

type DebtData = z.infer<typeof debtInput>

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_INPUT')
  return parsed.data
}

/**
 * Fills in the term or the instalment, whichever is missing, and drops what a kind cannot have.
 * Throws: 'INVALID_INPUT' (a loan or card instalments with neither), 'INSTALMENT_TOO_LOW' (never pays it off)
 */
function normalise(d: DebtData): DebtData {
  const data = { ...d }
  if (data.kind !== 'PERSONAL') data.direction = 'WE_OWE'
  if (data.kind === 'INSTALMENTS') data.rateBp = 0
  if (data.direction === 'OWED_TO_US') {
    data.termMonths = null
    data.instalmentCents = null
  }
  if (data.kind !== 'LOAN') data.institutionId = null
  if (data.kind !== 'PERSONAL' && !data.termMonths && !data.instalmentCents) throw new Error('INVALID_INPUT')
  if (data.termMonths && !data.instalmentCents) data.instalmentCents = annuityInstalment(data.principalCents, data.rateBp, data.termMonths)
  if (data.instalmentCents && !data.termMonths) {
    data.termMonths = termFromInstalment(data.principalCents, data.rateBp, data.instalmentCents)
    if (!data.termMonths) throw new Error('INSTALMENT_TOO_LOW')
  }
  return data
}

const hasSchedule = (d: { termMonths: number | null; instalmentCents: number | null }): boolean =>
  d.termMonths !== null && d.instalmentCents !== null

/** The first active Debt category (Debt › Loan in the starter set). Throws: 'CATEGORY_NOT_FOUND' */
async function defaultCategoryId(): Promise<string> {
  const c = await prisma.category.findFirst({
    where: { type: 'DEBT', parentId: { not: null }, archivedAt: null },
    orderBy: [{ parent: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    select: { id: true },
  })
  if (!c) throw new Error('CATEGORY_NOT_FOUND')
  return c.id
}

/** Throws: 'CATEGORY_NOT_FOUND', 'ACCOUNT_NOT_FOUND', 'MEMBER_NOT_FOUND', 'INSTITUTION_NOT_FOUND' */
async function assertRefs(d: DebtData): Promise<string> {
  const categoryId = d.categoryId ?? (await defaultCategoryId())
  await assertRuleRefs({ categoryId, accountId: d.accountId, memberId: d.memberId })
  if (d.institutionId) {
    const inst = await prisma.institution.findUnique({ where: { id: d.institutionId }, select: { id: true } })
    if (!inst) throw new Error('INSTITUTION_NOT_FOUND')
  }
  return categoryId
}

function debtData(d: DebtData) {
  return {
    name: d.name,
    kind: d.kind,
    direction: d.direction,
    counterparty: d.counterparty,
    institutionId: d.institutionId,
    principalCents: d.principalCents,
    rateBp: d.rateBp,
    termMonths: d.termMonths,
    instalmentCents: d.instalmentCents,
    startDate: dateOnlyToDate(d.startDate),
    accountId: d.accountId,
    memberId: d.memberId,
    note: d.note,
  }
}

/** The owned rule: one instalment a month from the start date to the last scheduled one */
function ruleData(d: DebtData, categoryId: string) {
  const rows = amortisationSchedule({
    principalCents: d.principalCents, rateBp: d.rateBp, instalmentCents: d.instalmentCents!, startDate: d.startDate, termMonths: d.termMonths!,
  })
  return {
    name: d.name,
    amountCents: d.instalmentCents!,
    amountVaries: false,
    categoryId,
    accountId: d.accountId,
    memberId: d.memberId,
    frequency: 'MONTH' as const,
    interval: 1,
    anchorDate: dateOnlyToDate(d.startDate),
    endsAt: dateOnlyToDate(rows.at(-1)?.dueDate ?? d.startDate),
    matchText: d.matchText,
    remindDays: d.remindDays,
  }
}

const DEBT_INCLUDE = {
  institution: { select: { name: true } },
  account: { select: { name: true } },
  rule: { select: { id: true, categoryId: true, matchText: true, remindDays: true, createdAt: true, category: { select: { name: true } } } },
  payments: { select: { id: true, bookedAt: true, amountCents: true, description: true, payee: true }, orderBy: { bookedAt: 'asc' } },
} satisfies Prisma.DebtInclude

type FullDebt = Prisma.DebtGetPayload<{ include: typeof DEBT_INCLUDE }>

async function findDebt(id: string): Promise<FullDebt> {
  const debt = await prisma.debt.findUnique({ where: { id }, include: DEBT_INCLUDE })
  if (!debt) throw new Error('DEBT_NOT_FOUND')
  return debt
}

// ── Computing a debt ─────────────────────────────────────────────────────────

function scheduleOf(d: FullDebt) {
  if (!d.termMonths || !d.instalmentCents) return []
  return amortisationSchedule({
    principalCents: d.principalCents, rateBp: d.rateBp, instalmentCents: d.instalmentCents, startDate: dateToDateOnly(d.startDate), termMonths: d.termMonths,
  })
}

/**
 * The debt's balance, progress and next instalment from its rule's due dates (`bills`, already
 * filtered to this rule) and its linked rows. Instalments due before the bills feature looks back
 * (a month before the debt was added) are history the household already paid.
 */
function compute(d: FullDebt, bills: UpcomingBill[], rowAmounts: Map<string, number>, today: string): { row: DebtRow; payments: DebtPaymentRow[]; schedule: ScheduleRowWithStatus[] } {
  const schedule = scheduleOf(d)
  const byDate = new Map(bills.map(b => [b.dueDate, b]))
  const historyBefore = d.rule ? addDays(dateToDateOnly(d.rule.createdAt), -HISTORY_GRACE_DAYS) : null
  const payments: DebtPaymentRow[] = []
  const rows: ScheduleRowWithStatus[] = schedule.map(s => {
    const bill = byDate.get(s.dueDate)
    if (!bill && historyBefore && s.dueDate < historyBefore) {
      payments.push({ date: s.dueDate, amountCents: s.paymentCents, kind: 'INSTALMENT', transactionId: null, text: null, paidBy: 'HAND' })
      return { ...s, status: 'PAID', transactionId: null, paidBy: null }
    }
    const status = bill?.status ?? occurrenceStatus(s.dueDate, today, null)
    if (status === 'PAID') {
      const amount = bill?.transactionId ? Math.abs(rowAmounts.get(bill.transactionId) ?? s.paymentCents) : s.paymentCents
      payments.push({ date: s.dueDate, amountCents: amount, kind: 'INSTALMENT', transactionId: bill?.transactionId ?? null, text: bill?.transactionText ?? null, paidBy: bill?.paidBy ?? 'HAND' })
    }
    return { ...s, status, transactionId: bill?.transactionId ?? null, paidBy: bill?.paidBy ?? null }
  })
  for (const p of d.payments) {
    payments.push({ date: dateToDateOnly(p.bookedAt), amountCents: Math.abs(p.amountCents), kind: 'EXTRA', transactionId: p.id, text: p.payee || p.description, paidBy: 'HAND' })
  }
  payments.sort((a, b) => a.date.localeCompare(b.date))

  const override = d.balanceOverrideCents
  const remaining = remainingBalance(
    { principalCents: d.principalCents, rateBp: d.rateBp, balanceOverrideCents: override, balanceOverrideAt: d.balanceOverrideAt ? dateToDateOnly(d.balanceOverrideAt) : null },
    payments as DebtPayment[],
  )
  const unpaid = rows.find(r => r.status !== 'PAID' && r.status !== 'SKIPPED')
  const start = dateToDateOnly(d.startDate)
  const nextDate = unpaid?.dueDate ?? (d.instalmentCents ? nextScheduledDue({ frequency: 'MONTH', interval: 1, anchorDate: start, endsAt: null }, today) : null)
  const projection = remaining > 0 && d.instalmentCents && nextDate ? projectPayoff(remaining, d.rateBp, d.instalmentCents, nextDate) : null
  const instalment = d.instalmentCents ?? 0
  const row: DebtRow = {
    id: d.id,
    name: d.name,
    kind: d.kind,
    direction: d.direction,
    counterparty: d.counterparty,
    institutionId: d.institutionId,
    institutionName: d.institution?.name ?? null,
    principalCents: d.principalCents,
    rateBp: d.rateBp,
    termMonths: d.termMonths,
    instalmentCents: d.instalmentCents,
    startDate: start,
    accountId: d.accountId,
    accountName: d.account?.name ?? null,
    memberId: d.memberId,
    categoryId: d.rule?.categoryId ?? null,
    categoryName: d.rule?.category.name ?? null,
    matchText: d.rule?.matchText ?? null,
    remindDays: d.rule?.remindDays ?? null,
    note: d.note,
    ruleId: d.ruleId,
    archived: d.archivedAt !== null,
    remainingCents: remaining,
    balanceOverride: override !== null && d.balanceOverrideAt ? { cents: override, date: dateToDateOnly(d.balanceOverrideAt) } : null,
    paidCount: rows.filter(r => r.status === 'PAID').length,
    nextDue: remaining > 0 && unpaid ? { date: unpaid.dueDate, amountCents: Math.min(unpaid.paymentCents, instalment || unpaid.paymentCents), status: unpaid.status } : null,
    payoffDate: projection?.payoffDate ?? null,
    neverEnds: remaining > 0 && instalment > 0 && projection === null,
    interestToGoCents: projection?.interestCents ?? 0,
    progress: d.principalCents > 0 ? Math.min(1, Math.max(0, 1 - remaining / d.principalCents)) : 1,
  }
  return { row, payments, schedule: rows }
}

/** Amounts of the rows that paid instalments, in one query */
async function amountsOf(bills: UpcomingBill[]): Promise<Map<string, number>> {
  const ids = bills.filter(b => b.transactionId).map(b => b.transactionId!)
  if (ids.length === 0) return new Map()
  const rows = await prisma.transaction.findMany({ where: { id: { in: ids } }, select: { id: true, amountCents: true } })
  return new Map(rows.map(r => [r.id, r.amountCents]))
}

async function billsFor(debts: FullDebt[], to: string, today: string): Promise<UpcomingBill[]> {
  const scheduled = debts.filter(d => d.ruleId)
  if (scheduled.length === 0) return []
  const from = scheduled.map(d => dateToDateOnly(d.startDate)).sort()[0]
  return listOccurrences({ from, to: to > from ? to : from }, today, { ruleIds: scheduled.map(d => d.ruleId!) })
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** Every debt (archived too) with its balance and next instalment, largest balance first */
export async function listDebts(today: string = todayDateOnly()): Promise<DebtRow[]> {
  const debts = await prisma.debt.findMany({ include: DEBT_INCLUDE })
  const bills = await billsFor(debts, addDays(today, NEXT_DUE_DAYS), today)
  const amounts = await amountsOf(bills)
  return debts
    .map(d => compute(d, bills.filter(b => b.ruleId === d.ruleId), amounts, today).row)
    .sort((a, b) => b.remainingCents - a.remainingCents || a.name.localeCompare(b.name))
}

/** One debt with its full schedule and payments. Throws: 'INVALID_INPUT', 'DEBT_NOT_FOUND' */
export async function getDebt(id: unknown, today: string = todayDateOnly()): Promise<DebtDetail> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const debt = await findDebt(id)
  const last = scheduleOf(debt).at(-1)?.dueDate ?? today
  const bills = await billsFor([debt], last > today ? last : today, today)
  const { row, payments, schedule } = compute(debt, bills, await amountsOf(bills), today)
  return { ...row, schedule, payments }
}

// ── Writing ──────────────────────────────────────────────────────────────────

/** Throws: 'INVALID_INPUT', 'INSTALMENT_TOO_LOW', 'CATEGORY_NOT_FOUND', 'ACCOUNT_NOT_FOUND', 'MEMBER_NOT_FOUND', 'INSTITUTION_NOT_FOUND' */
export async function createDebt(input: unknown): Promise<string> {
  const data = normalise(parse(debtInput, input))
  const categoryId = await assertRefs(data)
  return prisma.$transaction(async tx => {
    const rule = hasSchedule(data) ? await tx.recurringRule.create({ data: ruleData(data, categoryId) }) : null
    const debt = await tx.debt.create({ data: { ...debtData(data), ruleId: rule?.id ?? null } })
    return debt.id
  })
}

/**
 * Saves the debt and its rule together: the rule is made, changed or removed as the schedule
 * comes and goes; its hand marks are kept. Throws: as createDebt, plus 'DEBT_NOT_FOUND'
 */
export async function updateDebt(id: unknown, input: unknown): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const data = normalise(parse(debtInput, input))
  const debt = await findDebt(id)
  const categoryId = await assertRefs(data)
  await prisma.$transaction(async tx => {
    let ruleId = debt.ruleId
    if (hasSchedule(data)) {
      if (ruleId) await tx.recurringRule.update({ where: { id: ruleId }, data: ruleData(data, categoryId) })
      else ruleId = (await tx.recurringRule.create({ data: ruleData(data, categoryId) })).id
    } else if (ruleId) {
      await tx.recurringRule.delete({ where: { id: ruleId } })
      ruleId = null
    }
    await tx.debt.update({ where: { id }, data: { ...debtData(data), ruleId } })
  })
  await syncRuleEnd(id)
}

/**
 * Moves the rule's last due date to the projected payoff, so a debt paid off early stops
 * showing instalments (and one paid less comes back). Never ends before today's next instalment.
 */
async function syncRuleEnd(id: string, today: string = todayDateOnly()): Promise<void> {
  const debt = await findDebt(id)
  if (!debt.ruleId) return
  const scheduledEnd = scheduleOf(debt).at(-1)?.dueDate ?? dateToDateOnly(debt.startDate)
  const { row, schedule } = compute(debt, await billsFor([debt], scheduledEnd > today ? scheduledEnd : today, today), new Map(), today)
  let end = row.neverEnds ? scheduledEnd : row.payoffDate ?? scheduledEnd
  if (row.remainingCents <= 0) end = schedule.filter(s => s.status === 'PAID').at(-1)?.dueDate ?? dateToDateOnly(debt.startDate)
  await prisma.recurringRule.update({ where: { id: debt.ruleId }, data: { endsAt: dateOnlyToDate(end) } })
}

const balanceInput = z.object({
  debtId: z.string().min(1),
  /** null clears the statement balance */
  balanceCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  date: dateOnly,
})

/** The balance on a bank statement; payments after its date count on top. Throws: 'INVALID_INPUT', 'DEBT_NOT_FOUND' */
export async function setDebtBalance(input: unknown): Promise<void> {
  const { debtId, balanceCents, date } = parse(balanceInput, input)
  await findDebt(debtId)
  await prisma.debt.update({
    where: { id: debtId },
    data: { balanceOverrideCents: balanceCents, balanceOverrideAt: balanceCents === null ? null : dateOnlyToDate(date) },
  })
  await syncRuleEnd(debtId)
}

/** Archived debts drop out of the totals and their instalments stop. Throws: 'INVALID_INPUT', 'DEBT_NOT_FOUND' */
export async function setDebtArchived(id: unknown, archived: unknown): Promise<void> {
  if (typeof id !== 'string' || typeof archived !== 'boolean') throw new Error('INVALID_INPUT')
  const debt = await findDebt(id)
  const archivedAt = archived ? new Date() : null
  await prisma.$transaction([
    prisma.debt.update({ where: { id }, data: { archivedAt } }),
    ...(debt.ruleId ? [prisma.recurringRule.update({ where: { id: debt.ruleId }, data: { archivedAt } })] : []),
  ])
}

// ── Payments ─────────────────────────────────────────────────────────────────

/**
 * Rows of the last four months that could be a payment of this debt: the right direction,
 * not a transfer, not linked to a debt or a due date, not paying a bill. Likeliest first
 * (the name or person in the bank text), then the newest.
 * Throws: 'INVALID_INPUT', 'DEBT_NOT_FOUND'
 */
export async function debtPaymentCandidates(id: unknown, today: string = todayDateOnly()): Promise<CandidateRow[]> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const debt = await findDebt(id)
  const from = addDays(today, -CANDIDATE_DAYS)
  const [rows, bills] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        transferId: null,
        debtId: null,
        occurrence: null,
        amountCents: debt.direction === 'OWED_TO_US' ? { gt: 0 } : { lt: 0 },
        bookedAt: { gte: dateOnlyToDate(from), lte: dateOnlyToDate(today) },
      },
      select: { id: true, bookedAt: true, amountCents: true, accountId: true, description: true, payee: true, account: { select: { name: true } } },
    }),
    listOccurrences({ from: addDays(from, -7), to: addDays(today, 7) }, today),
  ])
  const payingBills = new Set(bills.filter(b => b.paidBy === 'AUTO').map(b => b.transactionId!))
  const keys = [debt.name, debt.counterparty ?? ''].map(payeeKey).filter(Boolean)
  return rows
    .filter(r => !payingBills.has(r.id))
    .map(r => {
      const key = `${payeeKey(r.description)} ${payeeKey(r.payee ?? '')}`.trim()
      const bookedAt = dateToDateOnly(r.bookedAt)
      return { id: r.id, bookedAt, amountCents: r.amountCents, accountId: r.accountId, accountName: r.account.name, key, text: r.payee || r.description, likely: keys.some(k => key.includes(k)) }
    })
    .sort((a, b) => Number(b.likely) - Number(a.likely) || b.bookedAt.localeCompare(a.bookedAt))
    .slice(0, CANDIDATE_LIMIT)
}

const linkInput = z.object({ debtId: z.string().min(1), transactionId: z.string().min(1) })

/**
 * Counts a row as a payment of the debt (an extra payment on a loan, a repayment of a personal one).
 * Throws: 'INVALID_INPUT', 'DEBT_NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'PAYMENT_ALREADY_LINKED', 'TRANSACTION_ALREADY_LINKED'
 */
export async function linkDebtPayment(input: unknown): Promise<void> {
  const { debtId, transactionId } = parse(linkInput, input)
  await findDebt(debtId)
  const row = await prisma.transaction.findUnique({ where: { id: transactionId }, select: { debtId: true, transferId: true, occurrence: { select: { id: true } } } })
  if (!row || row.transferId) throw new Error('TRANSACTION_NOT_FOUND')
  if (row.debtId) throw new Error('PAYMENT_ALREADY_LINKED')
  if (row.occurrence) throw new Error('TRANSACTION_ALREADY_LINKED')
  await prisma.transaction.update({ where: { id: transactionId }, data: { debtId } })
  await syncRuleEnd(debtId)
}

/** The row stays in the log; it no longer counts for the debt. Throws: 'INVALID_INPUT' */
export async function unlinkDebtPayment(transactionId: unknown): Promise<void> {
  if (typeof transactionId !== 'string') throw new Error('INVALID_INPUT')
  const row = await prisma.transaction.findUnique({ where: { id: transactionId }, select: { debtId: true } })
  if (!row?.debtId) return
  await prisma.transaction.update({ where: { id: transactionId }, data: { debtId: null } })
  await syncRuleEnd(row.debtId)
}

const cashInput = z.object({
  debtId: z.string().min(1),
  accountId: z.string().min(1),
  bookedAt: dateOnly,
  amountCents: z.number().int().positive(),
  createdByMemberId: z.string().nullish(),
})

/**
 * Adds the row for a payment made outside the bank (cash handed over or received) and links it.
 * Returns the new row's id. Throws: as createTransaction, plus 'DEBT_NOT_FOUND'
 */
export async function recordDebtCash(input: unknown): Promise<string> {
  const data = parse(cashInput, input)
  const debt = await findDebt(data.debtId)
  const id = await createTransaction({
    kind: debt.direction === 'OWED_TO_US' ? 'INCOME' : 'EXPENSE',
    accountId: data.accountId,
    amountCents: data.amountCents,
    bookedAt: data.bookedAt,
    categoryId: debt.rule?.categoryId ?? (await defaultCategoryId()),
    payee: debt.counterparty || debt.name,
    note: null,
    memberId: debt.memberId,
    createdByMemberId: data.createdByMemberId ?? null,
  })
  await prisma.transaction.update({ where: { id }, data: { debtId: debt.id } })
  await syncRuleEnd(debt.id)
  return id
}
