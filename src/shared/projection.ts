// Projections: where the household's money is heading, month by month. Types shared by
// main and renderer, and the pure forecast maths. Amounts are integer cents.
//
// Per month and category the forecast takes the larger of the budget plan and the rules
// (bills, subscriptions, income, instalments) due that month (decided 2026-10-30); a month
// with no plan of its own repeats this month's plan (or the latest before it), so a one-off
// future month never spreads (decided 2026-10-30). The current month only adds what is still
// to come: expected − booked so far, never below 0.

import { sumMoney } from './money'
import { addMonths, monthRange } from './date-only'
import { isOutgoing } from './budget'
import { occurrencesBetween, type Schedule } from './recurrence'
import type { CategoryType } from './ledger'

/** Months ahead the page can show (decided 2026-10-30) */
export const HORIZONS = [6, 12, 24] as const
export type Horizon = (typeof HORIZONS)[number]
export const DEFAULT_HORIZON: Horizon = 12

/** Why a category has an amount in a month */
export type ProjectionSource = 'RULES' | 'PLAN' | 'BOTH'

export interface ProjectionLine {
  categoryId: string
  name: string
  type: CategoryType
  /** Signed: money out is negative */
  amountCents: number
  source: ProjectionSource
  /** Names of the rules due in the month, for "why" */
  ruleNames: string[]
}

export interface ProjectionMonth {
  /** 'yyyy-MM' */
  month: string
  startCents: number
  /** Money coming in, positive */
  inCents: number
  /** Money going out, positive */
  outCents: number
  endCents: number
  /** Month whose budget plan was used; differs from `month` when a plan is repeated, null with no plan at all */
  planMonth: string | null
  /** Largest first */
  lines: ProjectionLine[]
}

export interface Projection {
  /** 'yyyy-MM-dd' */
  today: string
  /** Money in accounts now, meal vouchers apart */
  startCents: number
  /** Active accounts; 0 shows "add an account first" */
  accountCount: number
  months: ProjectionMonth[]
  /** Lowest month-end balance */
  lowest: { month: string; cents: number }
  /** First month that ends below 0; null when none does */
  firstNegativeMonth: string | null
  endCents: number
  hasRules: boolean
  hasPlan: boolean
}

export interface ProjectionRule {
  name: string
  categoryId: string
  /** Positive; the category type gives the direction */
  amountCents: number
  schedule: Schedule
}

export interface ProjectionInput {
  /** 'yyyy-MM-dd' */
  today: string
  startCents: number
  accountCount: number
  months: number
  /** Every category a rule or plan may point at (never groups) */
  categories: Map<string, { name: string; type: CategoryType }>
  rules: ProjectionRule[]
  /** month → category → planned cents (positive); only months that have a plan */
  plans: Map<string, Map<string, number>>
  /** category → booked so far this month, as the budget counts it (spending positive, a refund lowers it) */
  actualSoFar: Map<string, number>
}

/** The month whose plan applies to `month`: its own, else the plan of `current` or the latest before it */
export function planMonthFor(month: string, planned: string[], current: string): string | null {
  if (planned.includes(month)) return month
  let found: string | null = null
  for (const m of planned) if (m <= current && (found === null || m > found)) found = m
  return found
}

/** Every rule's due dates in a month, summed per category (positive cents) with the rule names */
function rulesInMonth(rules: ProjectionRule[], month: string): Map<string, { cents: number; names: string[] }> {
  const { gte, lt } = monthRange(month)
  const from = gte.toISOString().slice(0, 10)
  const to = new Date(lt.getTime() - 86_400_000).toISOString().slice(0, 10)
  const out = new Map<string, { cents: number; names: string[] }>()
  for (const r of rules) {
    const due = occurrencesBetween(r.schedule, from, to).length
    if (due === 0) continue
    const entry = out.get(r.categoryId) ?? { cents: 0, names: [] }
    entry.cents += due * r.amountCents
    if (!entry.names.includes(r.name)) entry.names.push(r.name)
    out.set(r.categoryId, entry)
  }
  return out
}

/** The forecast: month by month from today's balance */
export function projectMonths(input: ProjectionInput): Projection {
  const current = input.today.slice(0, 7)
  const planned = [...input.plans.keys()].sort()
  const months: ProjectionMonth[] = []
  let balance = input.startCents

  for (let i = 0; i < input.months; i++) {
    const month = addMonths(current, i)
    const planMonth = planMonthFor(month, planned, current)
    const plan = planMonth ? input.plans.get(planMonth)! : new Map<string, number>()
    const rules = rulesInMonth(input.rules, month)
    const lines: ProjectionLine[] = []

    for (const categoryId of new Set([...plan.keys(), ...rules.keys()])) {
      const category = input.categories.get(categoryId)
      if (!category) continue
      // Planned saving is usually a transfer to an account already in the total (rules still count)
      const planCents = category.type === 'SAVINGS' ? 0 : (plan.get(categoryId) ?? 0)
      const rule = rules.get(categoryId)
      const ruleCents = rule?.cents ?? 0
      let cents = Math.max(planCents, ruleCents)
      // This month: only what is still to come; paid bills are already in the booked rows
      if (i === 0) cents = Math.max(0, cents - (input.actualSoFar.get(categoryId) ?? 0))
      if (cents === 0) continue
      lines.push({
        categoryId,
        name: category.name,
        type: category.type,
        amountCents: isOutgoing(category.type) ? 0 - cents : cents,
        source: ruleCents > 0 && planCents > 0 ? 'BOTH' : ruleCents > 0 ? 'RULES' : 'PLAN',
        ruleNames: rule?.names ?? [],
      })
    }
    lines.sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents) || a.name.localeCompare(b.name))

    const inCents = sumMoney(lines.filter(l => l.amountCents > 0).map(l => l.amountCents))
    const outCents = 0 - sumMoney(lines.filter(l => l.amountCents < 0).map(l => l.amountCents))
    const startCents = balance
    balance = startCents + inCents - outCents
    months.push({ month, startCents, inCents, outCents, endCents: balance, planMonth, lines })
  }

  const lowest = months.reduce((min, m) => (m.endCents < min.cents ? { month: m.month, cents: m.endCents } : min), {
    month: months[0]?.month ?? current,
    cents: months[0]?.endCents ?? input.startCents,
  })
  return {
    today: input.today,
    startCents: input.startCents,
    accountCount: input.accountCount,
    months,
    lowest,
    firstNegativeMonth: months.find(m => m.endCents < 0)?.month ?? null,
    endCents: balance,
    hasRules: input.rules.length > 0,
    hasPlan: planned.length > 0,
  }
}
