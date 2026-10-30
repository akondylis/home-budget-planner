// Monthly budget: types shared by main and renderer, and the budget maths.
// All amounts are integer cents. Planned amounts are stored positive; the
// category type says which way they go. Transfers have no category, so they
// never reach these sums.

import { sumMoney } from './money'
import type { CategoryType } from './ledger'

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
  let carry = 0
  for (const m of months) carry = Math.max(0, m.plannedCents + carry - m.actualCents)
  return carry
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
