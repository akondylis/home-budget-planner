// Debts & loans: types shared by main and renderer, and the pure maths (schedule, balance,
// payoff, snowball/avalanche). Amounts are integer cents, positive; rates are annual in basis
// points (525 = 5.25 %), charged monthly on the balance before each instalment.
//
// A debt with instalments owns a recurring rule (decided 2026-10-30), so its due dates and
// payments come from src/shared/recurrence.ts; this module only turns them into a balance.

import { addMonths, addMonthsToDate } from './date-only'
import type { PaymentStatus } from './recurrence'

export const DEBT_KINDS = ['LOAN', 'INSTALMENTS', 'PERSONAL'] as const
export type DebtKind = (typeof DEBT_KINDS)[number]
export const DEBT_DIRECTIONS = ['WE_OWE', 'OWED_TO_US'] as const
export type DebtDirection = (typeof DEBT_DIRECTIONS)[number]
export const PAYOFF_STRATEGIES = ['SNOWBALL', 'AVALANCHE'] as const
export type PayoffStrategy = (typeof PAYOFF_STRATEGIES)[number]

/** Longest schedule walked (50 years), so a tiny instalment can never loop for long */
export const MAX_DEBT_MONTHS = 600
/** Highest rate accepted, 99.99 % */
export const MAX_RATE_BP = 9999

export interface DebtInput {
  name: string
  kind: DebtKind
  direction: DebtDirection
  counterparty: string | null
  institutionId: string | null
  /** Amount borrowed, or what is left when already paying it */
  principalCents: number
  rateBp: number
  /** Number of monthly instalments; null with an instalment = worked out from it */
  termMonths: number | null
  /** null with a term = worked out from it */
  instalmentCents: number | null
  /** 'yyyy-MM-dd', the first instalment (or the day it was lent) */
  startDate: string
  accountId: string | null
  memberId: string | null
  /** Category of the instalments; null = Debt › Loan */
  categoryId: string | null
  matchText: string | null
  remindDays: number | null
  note: string | null
}

/** One payment that lowers the balance: an instalment (interest charged first) or an extra one */
export interface DebtPayment {
  /** 'yyyy-MM-dd' */
  date: string
  /** Positive */
  amountCents: number
  kind: 'INSTALMENT' | 'EXTRA'
}

/** A payment listed in the detail */
export interface DebtPaymentRow extends DebtPayment {
  transactionId: string | null
  text: string | null
  /** 'AUTO' = matched to an instalment on read, 'HAND' = marked or linked by hand */
  paidBy: 'AUTO' | 'HAND'
}

export interface DebtRow extends DebtInput {
  id: string
  ruleId: string | null
  institutionName: string | null
  accountName: string | null
  categoryName: string | null
  archived: boolean
  remainingCents: number
  /** Balance read from a statement, which payments after its date lower */
  balanceOverride: { cents: number; date: string } | null
  /** Instalments paid (skipped ones not counted) */
  paidCount: number
  /** Next unpaid instalment; null when there is no schedule or it is done */
  nextDue: { date: string; amountCents: number; status: PaymentStatus } | null
  /** 'yyyy-MM-dd' of the last instalment at today's balance; null without a schedule or when it never ends */
  payoffDate: string | null
  /** The instalment does not cover the monthly interest */
  neverEnds: boolean
  interestToGoCents: number
  /** Paid share of the principal, 0..1 */
  progress: number
}

export interface ScheduleRow {
  n: number
  /** 'yyyy-MM-dd' */
  dueDate: string
  paymentCents: number
  interestCents: number
  principalCents: number
  /** Balance after this payment */
  balanceCents: number
}

export interface ScheduleRowWithStatus extends ScheduleRow {
  status: PaymentStatus
  transactionId: string | null
  paidBy: 'AUTO' | 'HAND' | null
}

export interface DebtDetail extends DebtRow {
  schedule: ScheduleRowWithStatus[]
  payments: DebtPaymentRow[]
}

/** Interest for one month on a balance */
export const monthlyInterest = (balanceCents: number, rateBp: number): number =>
  balanceCents > 0 ? Math.round((balanceCents * rateBp) / 120_000) : 0

/** The fixed monthly payment that clears `principal` in `months` (annuity); interest-free = equal parts, rounded up */
export function annuityInstalment(principalCents: number, rateBp: number, months: number): number {
  if (months <= 0 || principalCents <= 0) return 0
  if (rateBp <= 0) return Math.ceil(principalCents / months)
  const r = rateBp / 120_000
  return Math.round((principalCents * r) / (1 - Math.pow(1 + r, -months)))
}

/** Month by month: interest first, then the instalment; the last row takes what is left */
export function amortisationSchedule(d: {
  principalCents: number
  rateBp: number
  instalmentCents: number
  startDate: string
  termMonths: number
}): ScheduleRow[] {
  const rows: ScheduleRow[] = []
  let balance = d.principalCents
  for (let n = 1; n <= Math.min(d.termMonths, MAX_DEBT_MONTHS) && balance > 0; n++) {
    const interest = monthlyInterest(balance, d.rateBp)
    const payment = n === d.termMonths ? balance + interest : Math.min(d.instalmentCents, balance + interest)
    const principal = payment - interest
    balance -= principal
    rows.push({ n, dueDate: addMonthsToDate(d.startDate, n - 1), paymentCents: payment, interestCents: interest, principalCents: principal, balanceCents: balance })
  }
  return rows
}

/**
 * What is left today: from the statement balance (payments after its date) or the principal,
 * each instalment adds a month's interest before it is paid; extra payments go straight to the balance.
 */
export function remainingBalance(
  d: { principalCents: number; rateBp: number; balanceOverrideCents: number | null; balanceOverrideAt: string | null },
  payments: DebtPayment[],
): number {
  const from = d.balanceOverrideCents !== null ? d.balanceOverrideAt : null
  let balance = d.balanceOverrideCents ?? d.principalCents
  const ordered = payments.filter(p => !from || p.date > from).sort((a, b) => a.date.localeCompare(b.date))
  for (const p of ordered) {
    if (p.kind === 'INSTALMENT') balance += monthlyInterest(balance, d.rateBp)
    balance = Math.max(0, balance - p.amountCents)
  }
  return balance
}

export interface PayoffProjection {
  months: number
  /** 'yyyy-MM-dd' of the last instalment; null when nothing is left */
  payoffDate: string | null
  interestCents: number
}

/** Instalments left from `nextDue` at this balance; null when the instalment never covers the interest */
export function projectPayoff(balanceCents: number, rateBp: number, instalmentCents: number, nextDue: string): PayoffProjection | null {
  let balance = balanceCents
  let interestTotal = 0
  let months = 0
  while (balance > 0) {
    if (months >= MAX_DEBT_MONTHS) return null
    const interest = monthlyInterest(balance, rateBp)
    if (instalmentCents <= interest) return null
    interestTotal += interest
    balance = Math.max(0, balance + interest - instalmentCents)
    months++
  }
  return { months, payoffDate: months ? addMonthsToDate(nextDue, months - 1) : null, interestCents: interestTotal }
}

/** Instalments needed at this payment (the form's "months or instalment") */
export function termFromInstalment(principalCents: number, rateBp: number, instalmentCents: number): number | null {
  return projectPayoff(principalCents, rateBp, instalmentCents, '2000-01-01')?.months ?? null
}

export interface PlanDebt {
  id: string
  balanceCents: number
  rateBp: number
  instalmentCents: number
}

export interface PayoffOutcome {
  /** 'yyyy-MM' the last debt is cleared; null when one never ends */
  debtFreeMonth: string | null
  months: number | null
  interestCents: number
  /** Each debt's last month, in the order the extra goes to them */
  order: Array<{ id: string; payoffMonth: string | null }>
}

export interface PayoffPlan extends PayoffOutcome {
  strategy: PayoffStrategy
  /** Every debt paying its own instalment, no extra */
  baseline: PayoffOutcome
}

/** Snowball: smallest balance first (quick wins). Avalanche: highest rate first (least interest). */
export function payoffOrder(debts: PlanDebt[], strategy: PayoffStrategy): PlanDebt[] {
  return [...debts].sort((a, b) =>
    strategy === 'AVALANCHE'
      ? b.rateBp - a.rateBp || a.balanceCents - b.balanceCents
      : a.balanceCents - b.balanceCents || b.rateBp - a.rateBp)
}

function simulate(debts: PlanDebt[], extraCents: number, rollover: boolean, firstMonth: string): PayoffOutcome {
  const balance = new Map(debts.map(d => [d.id, d.balanceCents]))
  const paidOff = new Map<string, number>()
  let interest = 0
  let month = 0
  while ([...balance.values()].some(b => b > 0) && month < MAX_DEBT_MONTHS) {
    month++
    let pool = extraCents
    for (const d of debts) {
      const b = balance.get(d.id)!
      if (b <= 0) {
        if (rollover) pool += d.instalmentCents
        continue
      }
      const i = monthlyInterest(b, d.rateBp)
      interest += i
      const after = b + i - d.instalmentCents
      if (after < 0 && rollover) pool -= after
      balance.set(d.id, Math.max(0, after))
    }
    for (const d of debts) {
      if (pool <= 0) break
      const b = balance.get(d.id)!
      if (b <= 0) continue
      const pay = Math.min(pool, b)
      balance.set(d.id, b - pay)
      pool -= pay
    }
    for (const d of debts) if (balance.get(d.id)! <= 0 && !paidOff.has(d.id)) paidOff.set(d.id, month)
  }
  const monthOf = (n: number | undefined): string | null => (n === undefined ? null : addMonths(firstMonth, n - 1))
  const allDone = paidOff.size === debts.length
  const last = allDone ? Math.max(0, ...paidOff.values()) : null
  return {
    debtFreeMonth: last ? monthOf(last) : null,
    months: last,
    interestCents: interest,
    order: debts.map(d => ({ id: d.id, payoffMonth: monthOf(paidOff.get(d.id)) })),
  }
}

/** Extra each month goes to one debt at a time; a cleared debt's instalment rolls into the next */
export function planPayoff(debts: PlanDebt[], extraMonthlyCents: number, strategy: PayoffStrategy, firstMonth: string): PayoffPlan {
  const ordered = payoffOrder(debts.filter(d => d.balanceCents > 0), strategy)
  return {
    strategy,
    ...simulate(ordered, Math.max(0, extraMonthlyCents), true, firstMonth),
    baseline: simulate(ordered, 0, false, firstMonth),
  }
}
