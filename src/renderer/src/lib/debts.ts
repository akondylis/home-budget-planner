// Debts & loans page helpers: the form draft, the rate text, the top tiles and the plan input.
import { addMonthsToDate } from '../../../shared/date-only'
import { parseMoney, sumMoney } from '../../../shared/money'
import {
  MAX_DEBT_MONTHS,
  MAX_RATE_BP,
  annuityInstalment,
  termFromInstalment,
  type DebtDirection,
  type DebtInput,
  type DebtKind,
  type DebtRow,
  type PlanDebt,
} from '../../../shared/debt'

/** How the form says how long a loan runs: by the number of months, or by the monthly payment */
export type TermMode = 'MONTHS' | 'INSTALMENT'

export interface DebtDraft {
  kind: DebtKind
  direction: DebtDirection
  name: string
  counterparty: string
  institutionId: string
  /** Money text, as typed */
  principal: string
  /** Percent text, "5,25" */
  rate: string
  termMode: TermMode
  months: string
  instalment: string
  /** Personal: pays back a fixed amount every month */
  repays: boolean
  startDate: string
  accountId: string
  memberId: string | null
  categoryId: string | null
  matchText: string
  remindDays: number | null
  note: string
}

export type DebtField = 'name' | 'principal' | 'rate' | 'months' | 'instalment' | 'startDate' | 'accountId'
export type DebtErrors = Partial<Record<DebtField, string>>

/** "5,25" or "5.25" → 525 basis points; '' → 0; null when it is not a rate */
export function parseRate(text: string): number | null {
  const s = text.trim().replace('%', '').replace(',', '.').trim()
  if (!s) return 0
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null
  const bp = Math.round(Number(s) * 100)
  return bp <= MAX_RATE_BP ? bp : null
}

/** 525 → "5,25" (Greek) / "5.25" */
export function rateToInput(bp: number, lang: string): string {
  if (!bp) return ''
  const s = (bp / 100).toFixed(2).replace(/\.?0+$/, '')
  return lang === 'en' ? s : s.replace('.', ',')
}

/** 525 → "5.25 %" in the page's language */
export function rateLabel(bp: number, lang: string): string {
  return `${rateToInput(bp, lang)} %`
}

export function emptyDebtDraft(today: string, kind: DebtKind = 'LOAN'): DebtDraft {
  return {
    kind,
    direction: 'WE_OWE',
    name: '',
    counterparty: '',
    institutionId: '',
    principal: '',
    rate: '',
    termMode: 'MONTHS',
    months: '',
    instalment: '',
    repays: false,
    startDate: addMonthsToDate(today, 1),
    accountId: '',
    memberId: null,
    categoryId: null,
    matchText: '',
    remindDays: null,
    note: '',
  }
}

export function draftFromDebt(d: DebtRow, money: (cents: number) => string, lang: string): DebtDraft {
  return {
    kind: d.kind,
    direction: d.direction,
    name: d.name,
    counterparty: d.counterparty ?? '',
    institutionId: d.institutionId ?? '',
    principal: money(d.principalCents),
    rate: rateToInput(d.rateBp, lang),
    termMode: 'MONTHS',
    months: d.termMonths ? String(d.termMonths) : '',
    instalment: d.instalmentCents ? money(d.instalmentCents) : '',
    repays: d.kind === 'PERSONAL' && d.instalmentCents !== null,
    startDate: d.startDate,
    accountId: d.accountId ?? '',
    memberId: d.memberId,
    categoryId: d.categoryId,
    matchText: d.matchText ?? '',
    remindDays: d.remindDays,
    note: d.note ?? '',
  }
}

/** Whether the draft has monthly instalments */
export function draftHasSchedule(d: DebtDraft): boolean {
  if (d.kind === 'PERSONAL') return d.direction === 'WE_OWE' && d.repays
  return true
}

/** The rate the draft uses: only a bank loan has one; card instalments and personal debts are interest-free */
const draftRate = (d: DebtDraft): number => (d.kind === 'LOAN' ? parseRate(d.rate) ?? 0 : 0)

/**
 * The live figure under the term: the instalment for N months, or the months for an
 * instalment; `tooLow` when that instalment never covers the interest.
 */
export function draftPreview(d: DebtDraft): { instalmentCents: number | null; months: number | null; tooLow: boolean } {
  const principal = parseMoney(d.principal)
  if (!principal || principal <= 0 || !draftHasSchedule(d)) return { instalmentCents: null, months: null, tooLow: false }
  const rate = draftRate(d)
  if (d.termMode === 'MONTHS' || d.kind === 'INSTALMENTS') {
    const months = Number(d.months)
    if (!Number.isInteger(months) || months < 1 || months > MAX_DEBT_MONTHS) return { instalmentCents: null, months: null, tooLow: false }
    return { instalmentCents: annuityInstalment(principal, rate, months), months, tooLow: false }
  }
  const instalment = parseMoney(d.instalment)
  if (!instalment || instalment <= 0) return { instalmentCents: null, months: null, tooLow: false }
  const months = termFromInstalment(principal, rate, instalment)
  return { instalmentCents: instalment, months, tooLow: months === null }
}

export function validateDebtDraft(d: DebtDraft): DebtErrors {
  const errors: DebtErrors = {}
  if (!d.name.trim()) errors.name = 'name_required'
  const principal = parseMoney(d.principal)
  if (principal === null || principal <= 0) errors.principal = 'amount_invalid'
  if (d.kind === 'LOAN' && parseRate(d.rate) === null) errors.rate = 'rate_invalid'
  if (!d.startDate) errors.startDate = 'date_required'
  if (draftHasSchedule(d)) {
    const usesMonths = d.termMode === 'MONTHS' || d.kind === 'INSTALMENTS'
    if (usesMonths) {
      const months = Number(d.months)
      if (!Number.isInteger(months) || months < 1 || months > MAX_DEBT_MONTHS) errors.months = 'months_invalid'
    } else {
      const instalment = parseMoney(d.instalment)
      if (instalment === null || instalment <= 0) errors.instalment = 'amount_invalid'
      else if (!errors.principal && !errors.rate && draftPreview(d).tooLow) errors.instalment = 'instalment_too_low'
    }
  }
  if (d.kind === 'INSTALMENTS' && !d.accountId) errors.accountId = 'card_required'
  return errors
}

/** Draft → service input; call after validateDebtDraft found nothing */
export function draftToDebtInput(d: DebtDraft): DebtInput {
  const schedule = draftHasSchedule(d)
  const usesMonths = d.termMode === 'MONTHS' || d.kind === 'INSTALMENTS'
  return {
    name: d.name.trim(),
    kind: d.kind,
    direction: d.kind === 'PERSONAL' ? d.direction : 'WE_OWE',
    counterparty: d.counterparty.trim() || null,
    institutionId: d.kind === 'LOAN' ? d.institutionId || null : null,
    principalCents: parseMoney(d.principal) ?? 0,
    rateBp: draftRate(d),
    termMonths: schedule && usesMonths ? Number(d.months) : null,
    instalmentCents: schedule && !usesMonths ? parseMoney(d.instalment) : null,
    startDate: d.startDate,
    accountId: d.accountId || null,
    memberId: d.memberId,
    categoryId: d.categoryId,
    matchText: d.matchText.trim() || null,
    remindDays: d.remindDays,
    note: d.note.trim() || null,
  }
}

export interface DebtTotals {
  weOweCents: number
  owedToUsCents: number
  monthlyCents: number
  /** Latest payoff date of what the household owes; null when nothing has one */
  debtFreeDate: string | null
  /** A debt the household owes never ends at its instalment */
  someNeverEnd: boolean
}

/** The page's top tiles, from the active debts */
export function debtTotals(debts: DebtRow[]): DebtTotals {
  const active = debts.filter(d => !d.archived && d.remainingCents > 0)
  const owe = active.filter(d => d.direction === 'WE_OWE')
  const dates = owe.map(d => d.payoffDate).filter((x): x is string => x !== null).sort()
  return {
    weOweCents: sumMoney(owe.map(d => d.remainingCents)),
    owedToUsCents: sumMoney(active.filter(d => d.direction === 'OWED_TO_US').map(d => d.remainingCents)),
    monthlyCents: sumMoney(owe.filter(d => d.nextDue).map(d => d.instalmentCents ?? 0)),
    debtFreeDate: dates.at(-1) ?? null,
    someNeverEnd: owe.some(d => d.neverEnds),
  }
}

/** Why a debt is left out of the payoff plan, or null when it takes part */
export function planExclusion(d: DebtRow): 'owed_to_us' | 'no_instalment' | 'never_ends' | null {
  if (d.direction === 'OWED_TO_US') return 'owed_to_us'
  if (!d.instalmentCents) return 'no_instalment'
  if (d.neverEnds) return 'never_ends'
  return null
}

/** Active debts with a balance, split into the plan's input and the ones left out */
export function planInput(debts: DebtRow[]): { plan: PlanDebt[]; left: DebtRow[] } {
  const active = debts.filter(d => !d.archived && d.remainingCents > 0)
  return {
    plan: active.filter(d => planExclusion(d) === null).map(d => ({ id: d.id, balanceCents: d.remainingCents, rateBp: d.rateBp, instalmentCents: d.instalmentCents! })),
    left: active.filter(d => planExclusion(d) !== null),
  }
}

/** "Mar 2029" / "Μαρ 2029" for a 'yyyy-MM' or 'yyyy-MM-dd' */
export function shortMonthLabel(value: string, lang: string): string {
  const [y, m] = value.split('-').map(Number)
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'el-GR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)))
}

/** Whole months between two 'yyyy-MM' values (b − a) */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}
