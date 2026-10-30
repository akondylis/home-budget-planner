// Monthly budget: types shared by main and renderer, and the budget maths.
// All amounts are integer cents. Planned amounts are stored positive; the
// category type says which way they go. Transfers have no category, so they
// never reach these sums.

import { sumMoney } from './money'
import type { CategoryType } from './ledger'
import { yearMonths } from './date-only'

/** Where "copy last month" takes its amounts from; RULES = the bills' monthly cost */
export const COPY_SOURCES = ['PLAN', 'ACTUAL', 'RULES'] as const
export type CopySource = (typeof COPY_SOURCES)[number]

/** Money going out: everything but income */
export const isOutgoing = (type: CategoryType): boolean => type !== 'INCOME'

/** Booked sum of a category's rows → its actual: spending counts positive on outgoing categories, a refund lowers it */
export function actualFromSum(type: CategoryType, sumCents: number): number {
  // 0 − x, not −x: an empty month must be 0, never −0 (which formats as "−0,00 €")
  return isOutgoing(type) ? 0 - sumCents : sumCents
}

/** Whole euros, rounded up: a plan made from last month's spending */
export function roundUpToUnit(cents: number): number {
  return cents <= 0 ? 0 : Math.ceil(cents / 100) * 100
}

/**
 * Unspent money carried into the month after the given ones (oldest first, one entry per
 * month, 0 planned for a month with no line). Overspending never carries: it stops at 0.
 */
export function computeCarry(months: Array<{ plannedCents: number; actualCents: number }>): number {
  return carrySeries(months).at(-1)!
}

/**
 * Money carried into each month of a chain: entry i is what month i starts with, the last entry what
 * the month after them starts with. `start` = carried into the first month.
 */
export function carrySeries(months: Array<{ plannedCents: number; actualCents: number }>, start = 0): number[] {
  const series = [start]
  for (const m of months) series.push(Math.max(0, m.plannedCents + series.at(-1)! - m.actualCents))
  return series
}

export interface BudgetCategoryRow {
  id: string
  name: string
  icon: string | null
  archived: boolean
  carryOver: boolean
  plannedCents: number
  /** Unspent money brought from last month (carry-over categories only) */
  carriedInCents: number
  /** planned + carried in */
  availableCents: number
  actualCents: number
  /** available − actual; negative = over */
  leftCents: number
  /** Actual of the month before, for "Set to last month's spending" */
  previousActualCents: number
  /** Monthly cost of the category's bills and subscriptions (a yearly €480 → €40), offered as the plan */
  suggestedCents: number
}

export interface BudgetGroupRow {
  id: string
  name: string
  type: CategoryType
  icon: string | null
  plannedCents: number
  availableCents: number
  actualCents: number
  categories: BudgetCategoryRow[]
}

export interface BudgetSummary {
  plannedIncomeCents: number
  actualIncomeCents: number
  plannedOutCents: number
  availableOutCents: number
  actualOutCents: number
  /** Planned income − planned outgoings; the zero-based goal is 0 */
  leftToBudgetCents: number
  /** Available − actual over outgoing categories */
  leftToSpendCents: number
}

export interface BudgetMonth {
  /** 'yyyy-MM' */
  month: string
  /** At least one planned line */
  exists: boolean
  /** Updated time of the plan, ISO; null without a plan */
  updatedAt: string | null
  summary: BudgetSummary
  groups: BudgetGroupRow[]
  /** Outgoing categories with spending but nothing planned or carried */
  unplannedCount: number
  unplannedCents: number
  /** Rows of the month still to categorise (not in any sum) */
  uncategorisedCount: number
  /** Whether last month has a plan / any categorised rows, for the empty state */
  previousHasPlan: boolean
  previousHasActual: boolean
}

/** One category's figures from its plan, carry and actual */
export function budgetRow(
  base: Omit<BudgetCategoryRow, 'availableCents' | 'leftCents'>,
): BudgetCategoryRow {
  const availableCents = base.plannedCents + base.carriedInCents
  return { ...base, availableCents, leftCents: availableCents - base.actualCents }
}

/** Group sums from its categories */
export function budgetGroup(base: Omit<BudgetGroupRow, 'plannedCents' | 'availableCents' | 'actualCents'>): BudgetGroupRow {
  return {
    ...base,
    plannedCents: sumMoney(base.categories.map(c => c.plannedCents)),
    availableCents: sumMoney(base.categories.map(c => c.availableCents)),
    actualCents: sumMoney(base.categories.map(c => c.actualCents)),
  }
}

/** The tiles: left to budget (zero-based) and left to spend */
export function summariseBudget(groups: BudgetGroupRow[]): BudgetSummary {
  const income = groups.filter(g => !isOutgoing(g.type))
  const out = groups.filter(g => isOutgoing(g.type))
  const plannedIncomeCents = sumMoney(income.map(g => g.plannedCents))
  const plannedOutCents = sumMoney(out.map(g => g.plannedCents))
  const availableOutCents = sumMoney(out.map(g => g.availableCents))
  const actualOutCents = sumMoney(out.map(g => g.actualCents))
  return {
    plannedIncomeCents,
    actualIncomeCents: sumMoney(income.map(g => g.actualCents)),
    plannedOutCents,
    availableOutCents,
    actualOutCents,
    leftToBudgetCents: plannedIncomeCents - plannedOutCents,
    leftToSpendCents: availableOutCents - actualOutCents,
  }
}

// ── Year view ────────────────────────────────────────────────────────────────

/** Where "fill the empty months" takes its amounts from: one month's plan, the bills, or one amount for one category */
export const FILL_SOURCES = ['MONTH', 'RULES', 'AMOUNT'] as const
export type FillSource = (typeof FILL_SOURCES)[number]

export type FillYearInput =
  | { year: number; source: 'MONTH'; month: string }
  | { year: number; source: 'RULES' }
  | { year: number; source: 'AMOUNT'; categoryId: string; cents: number }

export interface YearMonthCell {
  plannedCents: number
  carriedInCents: number
  /** planned + carried in */
  availableCents: number
  actualCents: number
}

export interface YearCategoryRow {
  id: string
  name: string
  icon: string | null
  archived: boolean
  carryOver: boolean
  /** Carry-over on an outgoing category: unspent money chains month to month */
  carries: boolean
  /** Unspent money carried into January */
  carryInCents: number
  /** January … December */
  months: YearMonthCell[]
  plannedCents: number
  actualCents: number
  /** Carried into January + planned in the months so far */
  availableToDateCents: number
  /** Actual over the compared dates this year, the same dates last year, and the whole of last year */
  thisYearCents: number
  lastYearCents: number
  lastYearFullCents: number
  /** Monthly cost of the category's bills and subscriptions */
  suggestedCents: number
}

export interface YearGroupRow {
  id: string
  name: string
  type: CategoryType
  icon: string | null
  months: Array<{ plannedCents: number; actualCents: number }>
  plannedCents: number
  actualCents: number
  availableToDateCents: number
  thisYearCents: number
  lastYearCents: number
  lastYearFullCents: number
  categories: YearCategoryRow[]
}

export interface YearSummary {
  plannedIncomeCents: number
  actualIncomeCents: number
  plannedOutCents: number
  actualOutCents: number
  availableOutToDateCents: number
  /** Planned income − planned outgoings over the year; the zero-based goal is 0 */
  leftToBudgetCents: number
  /** Available so far − actual over outgoing categories */
  leftToSpendCents: number
}

/** The dates "vs last year" compares, both ends included ('yyyy-MM-dd') */
export interface YearCompare {
  from: string
  to: string
  lastFrom: string
  lastTo: string
  /** Any categorised row last year */
  hasLastYear: boolean
}

export interface BudgetYear {
  year: number
  /** Months that have started: 12 for a past year, 0 for a future one */
  elapsedMonths: number
  /** At least one planned line in the year */
  exists: boolean
  updatedAt: string | null
  summary: YearSummary
  groups: YearGroupRow[]
  /** null for a future year */
  compare: YearCompare | null
  /** Latest month up to December with a plan, the source of "Fill from the plan of …" */
  latestPlannedMonth: string | null
}

/** Months that have started in `year`, given this month ('yyyy-MM') */
export function elapsedMonths(year: number, currentMonth: string): number {
  const [cy, cm] = currentMonth.split('-').map(Number)
  return year < cy ? 12 : year > cy ? 0 : cm
}

/**
 * Months a fill writes to: from this month on in the current year, all 12 in any other year.
 * Past months of the current year are left as they were.
 */
export function fillMonths(year: number, currentMonth: string): string[] {
  const months = yearMonths(year)
  return year === Number(currentMonth.slice(0, 4)) ? months.filter(m => m >= currentMonth) : months
}

/**
 * This year from 1 January to today against the same dates last year (29 Feb → 28 Feb);
 * a past year compares whole years, a future year nothing.
 */
export function compareRange(year: number, today: string): Omit<YearCompare, 'hasLastYear'> | null {
  const thisYear = Number(today.slice(0, 4))
  if (year > thisYear) return null
  const to = year < thisYear ? `${year}-12-31` : today
  const lastTo = to.endsWith('-02-29') ? `${year - 1}-02-28` : `${year - 1}${to.slice(4)}`
  return { from: `${year}-01-01`, to, lastFrom: `${year - 1}-01-01`, lastTo }
}

/** One category's year from its 12 plans and actuals; `elapsed` months count towards "to date" */
export function yearRow(
  base: Omit<YearCategoryRow, 'months' | 'plannedCents' | 'actualCents' | 'availableToDateCents'> & { planned: number[]; actual: number[] },
  elapsed: number,
): YearCategoryRow {
  const { planned, actual, ...rest } = base
  const plain = planned.map((p, i) => ({ plannedCents: p, actualCents: actual[i] ?? 0 }))
  const carry = base.carries ? carrySeries(plain, base.carryInCents) : plain.map(() => 0)
  const months = plain.map((m, i) => ({ ...m, carriedInCents: carry[i], availableCents: m.plannedCents + carry[i] }))
  return {
    ...rest,
    months,
    plannedCents: sumMoney(planned),
    actualCents: sumMoney(actual),
    availableToDateCents: (base.carries ? base.carryInCents : 0) + sumMoney(planned.slice(0, elapsed)),
  }
}

/** Group sums from its categories, month by month */
export function yearGroup(
  base: Omit<YearGroupRow, 'months' | 'plannedCents' | 'actualCents' | 'availableToDateCents' | 'thisYearCents' | 'lastYearCents' | 'lastYearFullCents'>,
): YearGroupRow {
  const sum = (pick: (c: YearCategoryRow) => number) => sumMoney(base.categories.map(pick))
  return {
    ...base,
    months: Array.from({ length: 12 }, (_, i) => ({
      plannedCents: sum(c => c.months[i].plannedCents),
      actualCents: sum(c => c.months[i].actualCents),
    })),
    plannedCents: sum(c => c.plannedCents),
    actualCents: sum(c => c.actualCents),
    availableToDateCents: sum(c => c.availableToDateCents),
    thisYearCents: sum(c => c.thisYearCents),
    lastYearCents: sum(c => c.lastYearCents),
    lastYearFullCents: sum(c => c.lastYearFullCents),
  }
}

/** The year's tiles */
export function summariseYear(groups: YearGroupRow[]): YearSummary {
  const income = groups.filter(g => !isOutgoing(g.type))
  const out = groups.filter(g => isOutgoing(g.type))
  const plannedIncomeCents = sumMoney(income.map(g => g.plannedCents))
  const plannedOutCents = sumMoney(out.map(g => g.plannedCents))
  const availableOutToDateCents = sumMoney(out.map(g => g.availableToDateCents))
  const actualOutCents = sumMoney(out.map(g => g.actualCents))
  return {
    plannedIncomeCents,
    actualIncomeCents: sumMoney(income.map(g => g.actualCents)),
    plannedOutCents,
    actualOutCents,
    availableOutToDateCents,
    leftToBudgetCents: plannedIncomeCents - plannedOutCents,
    leftToSpendCents: availableOutToDateCents - actualOutCents,
  }
}
