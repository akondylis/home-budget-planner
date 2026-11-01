/**
 * Payment calendar: bills, subscriptions, instalments and expected income on their due
 * dates, from `billOccurrences` (paid status already worked out in main). Pure functions;
 * days are 'yyyy-MM-dd', months 'yyyy-MM'.
 */
import { addDays, yearMonths } from '../../../shared/date-only'
import { monthOf, monthWeeks, weekStart, type WeekStart } from '../../../shared/calendar-grid'
import { formatMoney, sumMoney } from '../../../shared/money'
import type { IcsEntry } from '../../../shared/ics'
import type { UpcomingBill } from '../../../shared/recurrence'

/** Weeks the List view looks ahead */
export const LIST_WEEKS = 8
/** Days back the List view looks for overdue ones (the bills page's history grace) */
export const LIST_LOOKBACK_DAYS = 31
/** Months ahead the .ics export covers */
export const ICS_MONTHS = 12

export const billKey = (b: UpcomingBill) => `${b.ruleId}|${b.dueDate}`

/** Money in (income rules) rather than a bill */
export const isIncome = (b: UpcomingBill) => b.amountCents > 0

/** Still to pay or to come in */
export const isOpen = (b: UpcomingBill) => b.status === 'UPCOMING' || b.status === 'DUE' || b.status === 'OVERDUE'

// ── Status filter ────────────────────────────────────────────────────────────

export type CalendarStatus = 'all' | 'toPay' | 'paid' | 'income'
export const CALENDAR_STATUSES: CalendarStatus[] = ['all', 'toPay', 'paid', 'income']

export function matchesStatus(b: UpcomingBill, status: CalendarStatus): boolean {
  switch (status) {
    case 'all': return true
    case 'toPay': return !isIncome(b) && isOpen(b)
    case 'paid': return b.status === 'PAID'
    case 'income': return isIncome(b)
  }
}

export function countByStatus(items: UpcomingBill[]): Record<CalendarStatus, number> {
  return Object.fromEntries(CALENDAR_STATUSES.map(s => [s, items.filter(b => matchesStatus(b, s)).length])) as Record<CalendarStatus, number>
}

// ── Grouping and totals ──────────────────────────────────────────────────────

export function groupByDay(items: UpcomingBill[]): Map<string, UpcomingBill[]> {
  const byDay = new Map<string, UpcomingBill[]>()
  for (const b of items) byDay.set(b.dueDate, [...(byDay.get(b.dueDate) ?? []), b])
  return byDay
}

export interface CalendarTotals {
  /** Bills still to pay (negative cents) */
  dueOut: number
  /** Income still to come in (positive cents) */
  expectedIn: number
  /** Bills already paid (negative cents) */
  paidOut: number
}

/** Skipped dates count nowhere; money out and money in are never netted */
export function totalsOf(items: UpcomingBill[]): CalendarTotals {
  const out = items.filter(b => !isIncome(b))
  return {
    dueOut: sumMoney(out.filter(isOpen).map(b => b.amountCents)),
    expectedIn: sumMoney(items.filter(b => isIncome(b) && isOpen(b)).map(b => b.amountCents)),
    paidOut: sumMoney(out.filter(b => b.status === 'PAID').map(b => b.amountCents)),
  }
}

// ── Ranges ───────────────────────────────────────────────────────────────────

/** The days the Month view's grid shows (whole weeks around the month) */
export function monthGridRange(month: string, firstDay: WeekStart): { from: string; to: string } {
  const weeks = monthWeeks(month, firstDay)
  return { from: weeks[0][0], to: weeks[weeks.length - 1][6] }
}

/** The List view: overdue ones from the last month, then this week and LIST_WEEKS - 1 more */
export function listRange(today: string, firstDay: WeekStart): { from: string; to: string } {
  return { from: addDays(today, -LIST_LOOKBACK_DAYS), to: addDays(weekStart(today, firstDay), LIST_WEEKS * 7 - 1) }
}

export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

// ── List view ────────────────────────────────────────────────────────────────

export interface AgendaWeek {
  /** First day of the week */
  start: string
  items: UpcomingBill[]
  totals: CalendarTotals
}

export interface Agenda {
  /** Past due dates still unpaid, oldest first */
  overdue: UpcomingBill[]
  /** From this week on; empty weeks are left out */
  weeks: AgendaWeek[]
}

/** Past dates that are paid or skipped are left out: the list is about what comes next */
export function buildAgenda(items: UpcomingBill[], today: string, firstDay: WeekStart, weeks = LIST_WEEKS): Agenda {
  const end = addDays(weekStart(today, firstDay), weeks * 7)
  const overdue = items.filter(b => b.dueDate < today && isOpen(b))
  const byWeek = new Map<string, UpcomingBill[]>()
  for (const b of items) {
    if (b.dueDate < today || b.dueDate >= end) continue
    const start = weekStart(b.dueDate, firstDay)
    byWeek.set(start, [...(byWeek.get(start) ?? []), b])
  }
  return {
    overdue,
    weeks: [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([start, list]) => ({ start, items: list, totals: totalsOf(list) })),
  }
}

// ── Year view ────────────────────────────────────────────────────────────────

export interface YearMonth {
  month: string
  /** Every bill due that month, paid or not (negative cents) */
  out: number
  /** Every income due that month (positive cents) */
  in: number
  /** Bills of the month still to pay */
  unpaidCount: number
  overdueCount: number
  /** Days income is due, sorted */
  payDays: string[]
}

export interface YearSummary {
  months: YearMonth[]
  /** The month with the most going out; null when nothing goes out */
  heaviest: string | null
  /** Largest |out| or in of a month, for the bar scale */
  scale: number
}

export function buildYear(items: UpcomingBill[], year: number): YearSummary {
  const live = items.filter(b => b.status !== 'SKIPPED')
  const months = yearMonths(year).map(month => {
    const list = live.filter(b => monthOf(b.dueDate) === month)
    const out = list.filter(b => !isIncome(b))
    const income = list.filter(isIncome)
    return {
      month,
      out: sumMoney(out.map(b => b.amountCents)),
      in: sumMoney(income.map(b => b.amountCents)),
      unpaidCount: out.filter(isOpen).length,
      overdueCount: out.filter(b => b.status === 'OVERDUE').length,
      payDays: [...new Set(income.map(b => b.dueDate))].sort(),
    }
  })
  let heaviest: string | null = null
  let most = 0
  for (const m of months) {
    if (-m.out > most) {
      most = -m.out
      heaviest = m.month
    }
  }
  const scale = Math.max(0, ...months.map(m => Math.max(-m.out, m.in)))
  return { months, heaviest, scale }
}

// ── Header line ──────────────────────────────────────────────────────────────

/** The next bill still to pay from today on, and how many are overdue */
export function calendarSummary(items: UpcomingBill[], today: string): { next: UpcomingBill | null; overdueCount: number } {
  return {
    next: items.find(b => !isIncome(b) && isOpen(b) && b.dueDate >= today) ?? null,
    overdueCount: items.filter(b => b.status === 'OVERDUE').length,
  }
}

// ── .ics export ──────────────────────────────────────────────────────────────

type Translate = (key: string, opts?: Record<string, unknown>) => string

/**
 * One all-day entry per open due date from today on (bills and expected income); a bill
 * reminds its own lead days or the household's, income has no reminder.
 */
export function toIcsEntries(items: UpcomingBill[], today: string, leadDays: number, t: Translate): IcsEntry[] {
  return items
    .filter(b => isOpen(b) && b.dueDate >= today)
    .map(b => {
      const amount = `${b.amountVaries ? '≈ ' : ''}${formatMoney(b.amountCents, { sign: 'exceptZero' })}`
      const instalment = b.instalment ? t('debts.instalment_n', { n: b.instalment.n, of: b.instalment.of }) : null
      return {
        uid: `${b.ruleId}-${b.dueDate}`,
        day: b.dueDate,
        summary: [b.name, amount].join(' · '),
        description: [isIncome(b) ? t('calendar.ics_income') : t('calendar.ics_bill'), instalment].filter(Boolean).join('\n'),
        remindDays: isIncome(b) ? null : b.remindDays ?? leadDays,
      }
    })
}
