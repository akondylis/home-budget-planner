// Budget page helpers: month navigation, the Planned cell's text and the meter tone.
// Pure, so the page stays presentational and these are unit-tested.

import { formatMoney, parseMoney } from '../../../shared/money'
import {
  budgetGroup,
  budgetRow,
  summariseBudget,
  summariseYear,
  yearGroup,
  yearRow,
  type BudgetMonth,
  type BudgetSummary,
  type BudgetYear,
  type YearSummary,
} from '../../../shared/budget'
import type { MeterTone } from '../components/ui/Meter'

/** 'yyyy-MM' → the first of that month (local), for `monthLabel` */
export function monthDate(month: string): Date {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

export type MonthTense = 'past' | 'current' | 'future'

/** Months compare as text ('yyyy-MM') */
export function monthTense(month: string, current: string): MonthTense {
  return month < current ? 'past' : month > current ? 'future' : 'current'
}

/** What the Planned cell shows while editing: "600,00" (no symbol), '' for nothing planned */
export function plannedText(cents: number): string {
  return cents === 0 ? '' : formatMoney(cents).replace(/[^\d.,-]/g, '')
}

export type PlannedParse = { ok: true; cents: number } | { ok: false; error: 'invalid' | 'negative' }

/** Typed text → cents; blank means nothing planned (0) */
export function parsePlanned(text: string): PlannedParse {
  if (text.trim() === '') return { ok: true, cents: 0 }
  const cents = parseMoney(text)
  if (cents === null) return { ok: false, error: 'invalid' }
  if (cents < 0) return { ok: false, error: 'negative' }
  return { ok: true, cents }
}

/** Spending meter: on track, near the plan (≥ 90 %) or over it. Income always reads as income */
export function meterTone(actualCents: number, availableCents: number, income = false): MeterTone {
  if (income) return 'income'
  if (actualCents > availableCents) return 'danger'
  if (availableCents > 0 && actualCents * 10 >= availableCents * 9) return 'warning'
  return 'accent'
}

/** The month with one category's plan changed, every sum recomputed (for an instant update before the reload) */
export function withPlanned(data: BudgetMonth, categoryId: string, plannedCents: number): BudgetMonth {
  const groups = data.groups.map(g =>
    g.categories.some(c => c.id === categoryId)
      ? budgetGroup({ ...g, categories: g.categories.map(c => (c.id === categoryId ? budgetRow({ ...c, plannedCents }) : c)) })
      : g,
  )
  return { ...data, groups, summary: summariseBudget(groups), exists: groups.some(g => g.categories.some(c => c.plannedCents > 0)) }
}

/** The year with one month of one category's plan changed, every sum and the carry chain recomputed */
export function withYearPlanned(data: BudgetYear, monthIndex: number, categoryId: string, plannedCents: number): BudgetYear {
  const groups = data.groups.map(g =>
    g.categories.some(c => c.id === categoryId)
      ? yearGroup({
          ...g,
          categories: g.categories.map(c => {
            if (c.id !== categoryId) return c
            const planned = c.months.map((m, i) => (i === monthIndex ? plannedCents : m.plannedCents))
            return yearRow({ ...c, planned, actual: c.months.map(m => m.actualCents) }, data.elapsedMonths)
          }),
        })
      : g,
  )
  return { ...data, groups, summary: summariseYear(groups), exists: groups.some(g => g.plannedCents > 0) }
}

/** The year's figures in the month tiles' shape: "available" is what the months so far allow */
export function yearAsBudgetSummary(s: YearSummary): BudgetSummary {
  return { ...s, availableOutCents: s.availableOutToDateCents }
}

/** This year against last: the difference, and the percentage when last year had something to compare with */
export function yearChange(thisCents: number, lastCents: number): { deltaCents: number; percent: number | null } {
  const deltaCents = thisCents - lastCents
  return { deltaCents, percent: lastCents > 0 ? Math.round((deltaCents * 100) / lastCents) : null }
}

/** Short month name for a column header: "Jan" / "Ιαν" */
export function shortMonthLabel(monthIndex: number, lang: string): string {
  const label = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'el-GR', { month: 'short' }).format(new Date(2000, monthIndex, 1))
  return label.charAt(0).toLocaleUpperCase(lang) + label.slice(1).replace(/\.$/, '')
}
