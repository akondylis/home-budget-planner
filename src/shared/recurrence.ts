// Subscriptions & bills: recurring rules, their due dates and how a booked row pays one.
// Types shared by main and renderer, and the pure date and matching maths. Amounts are
// integer cents; a rule's amount is stored positive and its category type gives the sign.
//
// Nothing is created on a due date (decided 2026-10-30): a typed or imported row that
// matches the rule marks it paid when the list is read; only hand marks are stored.

import { addDays, addMonthsToDate, daysBetween } from './date-only'
import { isOutgoing } from './budget'
import type { CategoryType } from './ledger'

export const RECURRING_FREQUENCIES = ['WEEK', 'MONTH', 'YEAR'] as const
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number]

/** Lifecycle of a bill, instalment or subscription charge */
export type PaymentStatus = 'UPCOMING' | 'DUE' | 'OVERDUE' | 'PAID' | 'SKIPPED'

/** Days from today that count as "due" rather than "upcoming" */
export const DUE_SOON_DAYS = 3
/** Matched amounts may differ by this share (price change, exchange rate) unless the amount varies */
export const AMOUNT_TOLERANCE = 0.1
/** Weekly rules match ±2 days, the rest ±7 (a bank posts a direct debit a few days late) */
export const matchWindowDays = (frequency: RecurringFrequency): number => (frequency === 'WEEK' ? 2 : 7)

/** Upper bound on due dates walked for one rule, so a bad anchor can never loop for long */
const MAX_STEPS = 5000

/** What the dates and matching need from a rule */
export interface Schedule {
  frequency: RecurringFrequency
  interval: number
  /** 'yyyy-MM-dd', the first due date */
  anchorDate: string
  /** 'yyyy-MM-dd' or null */
  endsAt: string | null
}

export interface RecurringRuleInput {
  name: string
  /** Positive cents */
  amountCents: number
  amountVaries: boolean
  categoryId: string
  accountId: string | null
  memberId: string | null
  frequency: RecurringFrequency
  interval: number
  anchorDate: string
  endsAt: string | null
  /** Bank text to match; null or empty = the name */
  matchText: string | null
  /** Remind this many days before a due date; null = the household setting */
  remindDays: number | null
}

export interface RecurringRuleRow extends RecurringRuleInput {
  id: string
  categoryName: string
  categoryType: CategoryType
  accountName: string | null
  archived: boolean
  /** What the rule costs (or brings) per month on average, positive */
  monthlyCents: number
  /** Next due date from today, 'yyyy-MM-dd'; null when it has ended */
  nextDue: string | null
}

/** One due date of a rule with its status */
export interface UpcomingBill {
  ruleId: string
  name: string
  categoryId: string
  categoryType: CategoryType
  frequency: RecurringFrequency
  interval: number
  /** 'yyyy-MM-dd' */
  dueDate: string
  /** Signed: a bill is negative, income positive */
  amountCents: number
  amountVaries: boolean
  /** The rule's own reminder; null = the household setting */
  remindDays: number | null
  status: PaymentStatus
  /** The row that paid it, matched or picked by hand */
  transactionId: string | null
  /** 'AUTO' = matched on read, 'HAND' = marked by hand */
  paidBy: 'AUTO' | 'HAND' | null
  /** Bank text and date of the paying row, for the hover */
  transactionText: string | null
  transactionDate: string | null
}

/** A booked row that might pay a due date */
export interface PaymentCandidate {
  id: string
  /** 'yyyy-MM-dd' */
  bookedAt: string
  amountCents: number
  accountId: string
  /** payeeKey() of the description and the payee, space-joined */
  key: string
  text: string
}

/** A row offered in "Mark as paid", the likeliest first */
export interface CandidateRow extends PaymentCandidate {
  accountName: string
  /** Bank text and amount fit the rule */
  likely: boolean
}

/** Signed amount of a rule: outgoing categories pay out */
export function ruleAmount(amountCents: number, type: CategoryType): number {
  return isOutgoing(type) ? 0 - amountCents : amountCents
}

/** The k-th due date (k = 0 is the anchor) */
export function dueDateAt(s: Schedule, k: number): string {
  if (s.frequency === 'WEEK') return addDays(s.anchorDate, 7 * s.interval * k)
  return addMonthsToDate(s.anchorDate, (s.frequency === 'YEAR' ? 12 : 1) * s.interval * k)
}

/** Due dates in [from, to], 'yyyy-MM-dd' inclusive, stopping at the end date */
export function occurrencesBetween(s: Schedule, from: string, to: string): string[] {
  const out: string[] = []
  const last = s.endsAt && s.endsAt < to ? s.endsAt : to
  for (let k = 0; k < MAX_STEPS; k++) {
    const due = dueDateAt(s, k)
    if (due > last) break
    if (due >= from) out.push(due)
  }
  return out
}

/** First due date on or after `today`; null when the rule has ended */
export function nextDue(s: Schedule, today: string): string | null {
  for (let k = 0; k < MAX_STEPS; k++) {
    const due = dueDateAt(s, k)
    if (s.endsAt && due > s.endsAt) return null
    if (due >= today) return due
  }
  return null
}

/** Average per month, rounded up to the cent: €480 a year → €40, €10 a week → €43.34 */
export function monthlyEquivalentCents(amountCents: number, frequency: RecurringFrequency, interval: number): number {
  const perYear = frequency === 'WEEK' ? 52 / interval : frequency === 'MONTH' ? 12 / interval : 1 / interval
  return Math.ceil((amountCents * perYear) / 12 - 1e-9)
}

export function occurrenceStatus(dueDate: string, today: string, mark: 'PAID' | 'SKIPPED' | null): PaymentStatus {
  if (mark) return mark
  if (dueDate < today) return 'OVERDUE'
  return daysBetween(dueDate, today) <= DUE_SOON_DAYS ? 'DUE' : 'UPCOMING'
}

export interface MatchRule {
  frequency: RecurringFrequency
  /** Signed */
  amountCents: number
  amountVaries: boolean
  accountId: string | null
  /** Normalised bank text (payeeKey) */
  matchKey: string
}

/** Whether a row could pay a rule, dates aside */
export function canPay(rule: MatchRule, c: PaymentCandidate): boolean {
  if (Math.sign(c.amountCents) !== Math.sign(rule.amountCents)) return false
  if (rule.accountId && c.accountId !== rule.accountId) return false
  if (!rule.matchKey || !c.key.includes(rule.matchKey)) return false
  if (rule.amountVaries) return true
  return Math.abs(Math.abs(c.amountCents) - Math.abs(rule.amountCents)) <= Math.abs(rule.amountCents) * AMOUNT_TOLERANCE
}

/**
 * The row paying each unmarked due date (oldest due date first, nearest row wins, then the
 * closest amount). A row pays at most one due date; rows in `taken` (marked by hand) are skipped.
 */
export function matchOccurrences(
  rule: MatchRule,
  dueDates: string[],
  candidates: PaymentCandidate[],
  taken: Set<string>,
): Map<string, PaymentCandidate> {
  const window = matchWindowDays(rule.frequency)
  const used = new Set(taken)
  const paid = new Map<string, PaymentCandidate>()
  const eligible = candidates.filter(c => canPay(rule, c))
  for (const due of [...dueDates].sort()) {
    const best = eligible
      .filter(c => !used.has(c.id) && daysBetween(c.bookedAt, due) <= window)
      .sort((a, b) =>
        daysBetween(a.bookedAt, due) - daysBetween(b.bookedAt, due) ||
        Math.abs(a.amountCents - rule.amountCents) - Math.abs(b.amountCents - rule.amountCents))[0]
    if (best) {
      used.add(best.id)
      paid.set(due, best)
    }
  }
  return paid
}
