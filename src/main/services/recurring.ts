// Subscriptions & bills (roadmap #7). A rule names an amount, a category and a schedule;
// its due dates are computed, never stored. A typed or imported row that matches pays a
// due date when the list is read; only marks made by hand (paid, skipped) are saved.

import { z } from 'zod'
import { prisma } from '../db/prisma'
import type { Prisma } from '../../../prisma/generated/client/client'
import { addDays, dateOnlyToDate, dateToDateOnly, daysBetween, isDateOnly, todayDateOnly } from '../../shared/date-only'
import { isOutgoing } from '../../shared/budget'
import { payeeKey } from '../../shared/payee-key'
import {
  RECURRING_FREQUENCIES,
  canPay,
  matchOccurrences,
  monthlyEquivalentCents,
  nextDue,
  occurrenceStatus,
  occurrencesBetween,
  ruleAmount,
  type MatchRule,
  type CandidateRow,
  type PaymentCandidate,
  type RecurringRuleRow,
  type Schedule,
  type UpcomingBill,
} from '../../shared/recurrence'
import { NOTIFY_LEAD_DAYS_MAX } from '../../shared/notifications'
import { assertMember } from './members'
import { createTransaction } from './transactions'

/** Due dates older than this before a rule was created are history, not overdue bills */
const HISTORY_GRACE_DAYS = 31
/** Widest match window of any frequency (see matchWindowDays) */
const MAX_WINDOW_DAYS = 7
/** How far either side of a due date "Mark as paid" looks for rows */
const CANDIDATE_DAYS = 14
/** How far back the form's "matches N rows" looks */
const MATCH_PREVIEW_DAYS = 400

const dateOnly = z.string().refine(isDateOnly)
const text = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null)

const ruleInput = z.object({
  name: z.string().trim().min(1).max(120),
  amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  amountVaries: z.boolean().default(false),
  categoryId: z.string().min(1),
  accountId: z.string().nullish().transform(v => v || null),
  memberId: z.string().nullish().transform(v => v || null),
  frequency: z.enum(RECURRING_FREQUENCIES),
  interval: z.number().int().min(1).max(99),
  anchorDate: dateOnly,
  endsAt: dateOnly.nullish().transform(v => v ?? null),
  matchText: text(120),
  remindDays: z.number().int().min(0).max(NOTIFY_LEAD_DAYS_MAX).nullish().transform(v => v ?? null),
}).refine(r => !r.endsAt || r.endsAt >= r.anchorDate)

const dueInput = z.object({ ruleId: z.string().min(1), dueDate: dateOnly })
const rangeInput = z.object({ from: dateOnly, to: dateOnly }).refine(r => r.from <= r.to)

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_INPUT')
  return parsed.data
}

const RULE_INCLUDE = {
  category: { select: { name: true, type: true, parentId: true } },
  account: { select: { name: true } },
} satisfies Prisma.RecurringRuleInclude

type FullRule = Prisma.RecurringRuleGetPayload<{ include: typeof RULE_INCLUDE }>

function schedule(r: FullRule): Schedule {
  return { frequency: r.frequency, interval: r.interval, anchorDate: dateToDateOnly(r.anchorDate), endsAt: r.endsAt ? dateToDateOnly(r.endsAt) : null }
}

function matchRule(r: FullRule): MatchRule {
  return {
    frequency: r.frequency,
    amountCents: ruleAmount(r.amountCents, r.category.type),
    amountVaries: r.amountVaries,
    accountId: r.accountId,
    matchKey: payeeKey(r.matchText || r.name),
  }
}

function toRow(r: FullRule, today: string): RecurringRuleRow {
  const s = schedule(r)
  return {
    id: r.id,
    name: r.name,
    amountCents: r.amountCents,
    amountVaries: r.amountVaries,
    categoryId: r.categoryId,
    categoryName: r.category.name,
    categoryType: r.category.type,
    accountId: r.accountId,
    accountName: r.account?.name ?? null,
    memberId: r.memberId,
    frequency: r.frequency,
    interval: r.interval,
    anchorDate: s.anchorDate,
    endsAt: s.endsAt,
    matchText: r.matchText,
    remindDays: r.remindDays,
    archived: r.archivedAt !== null,
    monthlyCents: monthlyEquivalentCents(r.amountCents, r.frequency, r.interval),
    nextDue: nextDue(s, today),
  }
}

/** Throws: 'CATEGORY_NOT_FOUND' (a group, archived or missing), 'ACCOUNT_NOT_FOUND', 'MEMBER_NOT_FOUND' */
async function assertRefs(data: z.infer<typeof ruleInput>): Promise<void> {
  const category = await prisma.category.findUnique({ where: { id: data.categoryId }, select: { parentId: true, archivedAt: true } })
  if (!category || category.parentId === null || category.archivedAt) throw new Error('CATEGORY_NOT_FOUND')
  if (data.accountId) {
    const account = await prisma.account.findUnique({ where: { id: data.accountId }, select: { archivedAt: true } })
    if (!account || account.archivedAt) throw new Error('ACCOUNT_NOT_FOUND')
  }
  if (data.memberId) await assertMember(data.memberId)
}

function ruleData(data: z.infer<typeof ruleInput>) {
  return {
    ...data,
    anchorDate: dateOnlyToDate(data.anchorDate),
    endsAt: data.endsAt ? dateOnlyToDate(data.endsAt) : null,
  }
}

async function findRule(id: string): Promise<FullRule> {
  const rule = await prisma.recurringRule.findUnique({ where: { id }, include: RULE_INCLUDE })
  if (!rule) throw new Error('RULE_NOT_FOUND')
  return rule
}

/** Throws: 'INVALID_DATE' when the date is not one of the rule's due dates */
function assertDueDate(rule: FullRule, dueDate: string): void {
  if (occurrencesBetween(schedule(rule), dueDate, dueDate).length !== 1) throw new Error('INVALID_DATE')
}

// ── Rules ────────────────────────────────────────────────────────────────────

/** Every rule (archived too), with its monthly cost and next due date */
export async function listRules(today: string = todayDateOnly()): Promise<RecurringRuleRow[]> {
  const rules = await prisma.recurringRule.findMany({ include: RULE_INCLUDE, orderBy: [{ name: 'asc' }] })
  return rules.map(r => toRow(r, today))
}

/** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'ACCOUNT_NOT_FOUND', 'MEMBER_NOT_FOUND' */
export async function createRule(input: unknown): Promise<string> {
  const data = parse(ruleInput, input)
  await assertRefs(data)
  const created = await prisma.recurringRule.create({ data: ruleData(data) })
  return created.id
}

/** Throws: as createRule, plus 'RULE_NOT_FOUND' */
export async function updateRule(id: unknown, input: unknown): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const data = parse(ruleInput, input)
  await findRule(id)
  await assertRefs(data)
  await prisma.recurringRule.update({ where: { id }, data: ruleData(data) })
}

/** Archived rules drop out of every list but the archive; their marks are kept. Throws: 'INVALID_INPUT', 'RULE_NOT_FOUND' */
export async function setRuleArchived(id: unknown, archived: unknown): Promise<void> {
  if (typeof id !== 'string' || typeof archived !== 'boolean') throw new Error('INVALID_INPUT')
  await findRule(id)
  await prisma.recurringRule.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } })
}

// ── Due dates ────────────────────────────────────────────────────────────────

/** Rows that might pay a rule between two dates: same direction, never a transfer */
async function candidateRows(from: string, to: string, where: Prisma.TransactionWhereInput = {}): Promise<Array<PaymentCandidate & { accountName: string }>> {
  const rows = await prisma.transaction.findMany({
    where: { ...where, transferId: null, bookedAt: { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) } },
    select: { id: true, bookedAt: true, amountCents: true, accountId: true, description: true, payee: true, account: { select: { name: true } } },
  })
  return rows.map(r => ({
    id: r.id,
    bookedAt: dateToDateOnly(r.bookedAt),
    amountCents: r.amountCents,
    accountId: r.accountId,
    accountName: r.account.name,
    key: `${payeeKey(r.description)} ${payeeKey(r.payee ?? '')}`.trim(),
    text: r.payee || r.description,
  }))
}

/**
 * Every due date of the active rules in [from, to] with its status, oldest first.
 * Throws: 'INVALID_INPUT'
 */
export async function listOccurrences(input: unknown, today: string = todayDateOnly()): Promise<UpcomingBill[]> {
  const { from, to } = parse(rangeInput, input)
  const rules = await prisma.recurringRule.findMany({
    where: { archivedAt: null },
    include: { ...RULE_INCLUDE, occurrences: { include: { transaction: { select: { description: true, payee: true, bookedAt: true } } } } },
  })
  if (rules.length === 0) return []
  const [candidates, linked] = await Promise.all([
    candidateRows(addDays(from, -MAX_WINDOW_DAYS), addDays(to, MAX_WINDOW_DAYS)),
    prisma.recurringOccurrence.findMany({ where: { transactionId: { not: null } }, select: { transactionId: true } }),
  ])
  const taken = new Set(linked.map(l => l.transactionId!))
  const bills: UpcomingBill[] = []
  for (const rule of rules) {
    const start = addDays(dateToDateOnly(rule.createdAt), -HISTORY_GRACE_DAYS)
    const dueDates = occurrencesBetween(schedule(rule), from > start ? from : start, to)
    if (dueDates.length === 0) continue
    const marks = new Map(rule.occurrences.map(o => [dateToDateOnly(o.dueDate), o]))
    const matched = matchOccurrences(matchRule(rule), dueDates.filter(d => !marks.has(d)), candidates, taken)
    for (const due of dueDates) {
      const mark = marks.get(due)
      const auto = matched.get(due)
      bills.push({
        ruleId: rule.id,
        name: rule.name,
        categoryId: rule.categoryId,
        categoryType: rule.category.type,
        frequency: rule.frequency,
        interval: rule.interval,
        dueDate: due,
        amountCents: ruleAmount(rule.amountCents, rule.category.type),
        amountVaries: rule.amountVaries,
        remindDays: rule.remindDays,
        status: occurrenceStatus(due, today, mark?.status ?? (auto ? 'PAID' : null)),
        transactionId: mark?.transactionId ?? auto?.id ?? null,
        paidBy: mark?.status === 'PAID' ? 'HAND' : auto ? 'AUTO' : null,
        transactionText: mark?.transaction ? (mark.transaction.payee || mark.transaction.description) : auto?.text ?? null,
        transactionDate: mark?.transaction ? dateToDateOnly(mark.transaction.bookedAt) : auto?.bookedAt ?? null,
      })
    }
  }
  return bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name))
}

/** Unpaid due dates up to `days` ahead and the overdue ones before, for the Overview card and the bell */
export async function listUnpaid(days: number, today: string = todayDateOnly()): Promise<UpcomingBill[]> {
  const bills = await listOccurrences({ from: addDays(today, -HISTORY_GRACE_DAYS * 3), to: addDays(today, days) }, today)
  return bills.filter(b => b.status !== 'PAID' && b.status !== 'SKIPPED')
}

/**
 * Rows within two weeks of a due date that could pay it, the likeliest first
 * (bank text and amount fit, then the nearest date). Rows already paying another due date,
 * marked by hand or matched, are left out.
 * Throws: 'INVALID_INPUT', 'RULE_NOT_FOUND', 'INVALID_DATE'
 */
export async function paymentCandidates(input: unknown): Promise<CandidateRow[]> {
  const { ruleId, dueDate } = parse(dueInput, input)
  const rule = await findRule(ruleId)
  assertDueDate(rule, dueDate)
  const match = matchRule(rule)
  const [from, to] = [addDays(dueDate, -CANDIDATE_DAYS), addDays(dueDate, CANDIDATE_DAYS)]
  const [rows, nearby] = await Promise.all([
    candidateRows(from, to, { amountCents: isOutgoing(rule.category.type) ? { lt: 0 } : { gt: 0 }, occurrence: null }),
    listOccurrences({ from: addDays(from, -MAX_WINDOW_DAYS), to: addDays(to, MAX_WINDOW_DAYS) }),
  ])
  const payingOthers = new Set(nearby
    .filter(b => b.paidBy === 'AUTO' && !(b.ruleId === ruleId && b.dueDate === dueDate))
    .map(b => b.transactionId!))
  return rows
    .filter(r => !payingOthers.has(r.id))
    .map(r => ({ ...r, likely: canPay(match, r) }))
    .sort((a, b) =>
      Number(b.likely) - Number(a.likely) ||
      daysBetween(a.bookedAt, dueDate) - daysBetween(b.bookedAt, dueDate) ||
      Math.abs(a.amountCents - match.amountCents) - Math.abs(b.amountCents - match.amountCents))
}

/** How many rows of the last year the bank text would match, for the form's live hint */
export async function countMatches(input: unknown, today: string = todayDateOnly()): Promise<number> {
  const { matchText } = parse(z.object({ matchText: z.string().max(120) }), input)
  const key = payeeKey(matchText)
  if (!key) return 0
  const rows = await candidateRows(addDays(today, -MATCH_PREVIEW_DAYS), today)
  return rows.filter(r => r.key.includes(key)).length
}

/**
 * Marks a due date paid, with the row that paid it (or none, when it was paid some other way).
 * Throws: 'INVALID_INPUT', 'RULE_NOT_FOUND', 'INVALID_DATE', 'TRANSACTION_NOT_FOUND', 'TRANSACTION_ALREADY_LINKED'
 */
export async function markPaid(input: unknown): Promise<void> {
  const { ruleId, dueDate, transactionId } = parse(dueInput.extend({ transactionId: z.string().nullable() }), input)
  const rule = await findRule(ruleId)
  assertDueDate(rule, dueDate)
  if (transactionId) {
    const row = await prisma.transaction.findUnique({ where: { id: transactionId }, include: { occurrence: true } })
    if (!row) throw new Error('TRANSACTION_NOT_FOUND')
    if (row.occurrence && !(row.occurrence.ruleId === ruleId && dateToDateOnly(row.occurrence.dueDate) === dueDate)) {
      throw new Error('TRANSACTION_ALREADY_LINKED')
    }
  }
  await saveMark(ruleId, dueDate, 'PAID', transactionId)
}

async function saveMark(ruleId: string, dueDate: string, status: 'PAID' | 'SKIPPED', transactionId: string | null): Promise<void> {
  const due = dateOnlyToDate(dueDate)
  await prisma.recurringOccurrence.upsert({
    where: { ruleId_dueDate: { ruleId, dueDate: due } },
    create: { ruleId, dueDate: due, status, transactionId },
    update: { status, transactionId },
  })
}

const cashInput = dueInput.extend({
  accountId: z.string().min(1),
  bookedAt: dateOnly,
  amountCents: z.number().int().positive(),
  createdByMemberId: z.string().nullish(),
})

/**
 * Adds the row for a bill paid outside the bank (cash) and marks the due date paid with it.
 * Returns the new row's id.
 * Throws: as createTransaction, plus 'RULE_NOT_FOUND', 'INVALID_DATE'
 */
export async function payInCash(input: unknown): Promise<string> {
  const data = parse(cashInput, input)
  const rule = await findRule(data.ruleId)
  assertDueDate(rule, data.dueDate)
  const id = await createTransaction({
    kind: isOutgoing(rule.category.type) ? 'EXPENSE' : 'INCOME',
    accountId: data.accountId,
    amountCents: data.amountCents,
    bookedAt: data.bookedAt,
    categoryId: rule.categoryId,
    payee: rule.name,
    note: null,
    memberId: rule.memberId,
    createdByMemberId: data.createdByMemberId ?? null,
  })
  try {
    await saveMark(rule.id, data.dueDate, 'PAID', id)
  } catch (err) {
    // The row and its mark go together
    await prisma.transaction.delete({ where: { id } })
    throw err
  }
  return id
}

/** A due date that will not be paid (a month off, a cancelled lesson). Throws: 'INVALID_INPUT', 'RULE_NOT_FOUND', 'INVALID_DATE' */
export async function skipOccurrence(input: unknown): Promise<void> {
  const { ruleId, dueDate } = parse(dueInput, input)
  assertDueDate(await findRule(ruleId), dueDate)
  await saveMark(ruleId, dueDate, 'SKIPPED', null)
}

/**
 * Takes a hand mark back; a row matched on read still pays it. A row added by "Paid in cash"
 * stays in the log. Throws: 'INVALID_INPUT'
 */
export async function unmarkOccurrence(input: unknown): Promise<void> {
  const { ruleId, dueDate } = parse(dueInput, input)
  await prisma.recurringOccurrence.deleteMany({ where: { ruleId, dueDate: dateOnlyToDate(dueDate) } })
}

/** Active rules' monthly cost per category, for the budget's suggested plan */
export async function monthlyByCategory(): Promise<Map<string, number>> {
  const rules = await prisma.recurringRule.findMany({ where: { archivedAt: null }, select: { categoryId: true, amountCents: true, frequency: true, interval: true } })
  const sums = new Map<string, number>()
  for (const r of rules) sums.set(r.categoryId, (sums.get(r.categoryId) ?? 0) + monthlyEquivalentCents(r.amountCents, r.frequency, r.interval))
  return sums
}

/** payeeKey of every active rule's bank text, so the subscription hint stops suggesting them */
export async function activeMatchKeys(): Promise<string[]> {
  const rules = await prisma.recurringRule.findMany({ where: { archivedAt: null }, select: { name: true, matchText: true } })
  return rules.map(r => payeeKey(r.matchText || r.name)).filter(k => k.length > 0)
}

