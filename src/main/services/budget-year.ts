import { z } from 'zod'
import { prisma } from '../db/prisma'
import { dayRange, isMonth, isYear, todayDateOnly, yearMonths } from '../../shared/date-only'
import { monthlyByCategory } from './recurring'
import {
  TYPE_ORDER,
  assertPlannable,
  bookedByMonth,
  carriedInto,
  fillEmptyLines,
  latest,
  parse,
  sumsByCategory,
} from './budgets'
import {
  actualFromSum,
  compareRange,
  elapsedMonths,
  fillMonths,
  isOutgoing,
  summariseYear,
  yearGroup,
  yearRow,
  type BudgetYear,
  type YearCategoryRow,
} from '../../shared/budget'

const year = z.number().refine(isYear)

/** The 12 months of a year, plan vs actual per category, and this year against last. Throws: 'INVALID_INPUT' */
export async function getBudgetYear(input: unknown): Promise<BudgetYear> {
  const y = parse(year, input)
  const today = todayDateOnly()
  const months = yearMonths(y)
  const elapsed = elapsedMonths(y, today.slice(0, 7))
  const range = compareRange(y, today)
  const none = Promise.resolve(new Map<string, number>())

  const [lines, rows, suggested, thisSums, lastSums, lastFullSums, latestPlan] = await Promise.all([
    prisma.budgetLine.findMany({
      where: { budget: { month: { gte: months[0], lte: months[11] } } },
      select: { categoryId: true, plannedCents: true, updatedAt: true, budget: { select: { month: true, updatedAt: true } } },
    }),
    prisma.transaction.findMany({
      where: { bookedAt: dayRange(`${y}-01-01`, `${y}-12-31`), categoryId: { not: null } },
      select: { categoryId: true, amountCents: true, bookedAt: true },
    }),
    monthlyByCategory(),
    range ? sumsByCategory(dayRange(range.from, range.to)) : none,
    range ? sumsByCategory(dayRange(range.lastFrom, range.lastTo)) : none,
    sumsByCategory(dayRange(`${y - 1}-01-01`, `${y - 1}-12-31`)),
    prisma.budget.findFirst({ where: { month: { lte: months[11] }, lines: { some: {} } }, orderBy: { month: 'desc' }, select: { month: true } }),
  ])

  // category → month → planned
  const planned = new Map<string, Map<string, number>>()
  for (const l of lines) {
    const byMonth = planned.get(l.categoryId) ?? new Map<string, number>()
    byMonth.set(l.budget.month, l.plannedCents)
    planned.set(l.categoryId, byMonth)
  }
  const booked = bookedByMonth(rows)

  // Archived categories still show in a year they were planned or used in (or used in last year, for the comparison)
  const used = [...new Set([...planned.keys(), ...booked.keys(), ...lastFullSums.keys()])]
  const categories = await prisma.category.findMany({
    where: { OR: [{ archivedAt: null }, { id: { in: used } }, { children: { some: { id: { in: used } } } }] },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  const carries = (c: (typeof categories)[number]) => c.parentId !== null && c.carryOver && isOutgoing(c.type)
  const carry = await carriedInto(months[0], categories.filter(carries))

  const rowsByGroup = new Map<string, YearCategoryRow[]>()
  for (const c of categories) {
    if (c.parentId === null) continue
    const row = yearRow(
      {
        id: c.id,
        name: c.name,
        icon: c.icon,
        archived: c.archivedAt !== null,
        carryOver: c.carryOver,
        carries: carries(c),
        carryInCents: carry.get(c.id) ?? 0,
        planned: months.map(m => planned.get(c.id)?.get(m) ?? 0),
        actual: months.map(m => actualFromSum(c.type, booked.get(c.id)?.get(m) ?? 0)),
        thisYearCents: actualFromSum(c.type, thisSums.get(c.id) ?? 0),
        lastYearCents: actualFromSum(c.type, lastSums.get(c.id) ?? 0),
        lastYearFullCents: actualFromSum(c.type, lastFullSums.get(c.id) ?? 0),
        suggestedCents: suggested.get(c.id) ?? 0,
      },
      elapsed,
    )
    rowsByGroup.set(c.parentId, [...(rowsByGroup.get(c.parentId) ?? []), row])
  }
  const groups = categories
    .filter(g => g.parentId === null && rowsByGroup.has(g.id))
    .sort((a, b) => TYPE_ORDER.get(a.type)! - TYPE_ORDER.get(b.type)! || a.sortOrder - b.sortOrder)
    .map(g => yearGroup({ id: g.id, name: g.name, type: g.type, icon: g.icon, categories: rowsByGroup.get(g.id)! }))

  return {
    year: y,
    elapsedMonths: elapsed,
    exists: lines.length > 0,
    updatedAt: lines.length > 0 ? latest(...lines.flatMap(l => [l.updatedAt, l.budget.updatedAt])).toISOString() : null,
    summary: summariseYear(groups),
    groups,
    compare: range && { ...range, hasLastYear: lastFullSums.size > 0 },
    latestPlannedMonth: latestPlan?.month ?? null,
  }
}

const fillInput = z.discriminatedUnion('source', [
  z.object({ year, source: z.literal('MONTH'), month: z.string().refine(isMonth) }),
  z.object({ year, source: z.literal('RULES') }),
  z.object({ year, source: z.literal('AMOUNT'), categoryId: z.string(), cents: z.number().int().positive() }),
])

/**
 * Fills the empty lines of the year's months (from this month on in the current year) from one
 * month's plan, from the bills' monthly cost, or with one amount for one category. Lines already
 * planned are never overwritten. Returns how many lines were written.
 * Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'BUDGET_SOURCE_EMPTY'
 */
export async function fillBudgetYear(input: unknown): Promise<number> {
  const fill = parse(fillInput, input)
  const amounts = new Map<string, number>()
  if (fill.source === 'AMOUNT') {
    await assertPlannable(fill.categoryId)
    amounts.set(fill.categoryId, fill.cents)
  } else {
    const active = await prisma.category.findMany({ where: { archivedAt: null, parentId: { not: null } }, select: { id: true } })
    const ids = new Set(active.map(c => c.id))
    if (fill.source === 'MONTH') {
      const lines = await prisma.budgetLine.findMany({ where: { budget: { month: fill.month }, categoryId: { in: [...ids] } } })
      for (const l of lines) amounts.set(l.categoryId, l.plannedCents)
    } else {
      for (const [id, cents] of await monthlyByCategory()) if (ids.has(id) && cents > 0) amounts.set(id, cents)
    }
  }
  if (amounts.size === 0) throw new Error('BUDGET_SOURCE_EMPTY')

  const targets = fillMonths(fill.year, todayDateOnly().slice(0, 7)).filter(m => fill.source !== 'MONTH' || m !== fill.month)
  return prisma.$transaction(async tx => {
    let written = 0
    for (const m of targets) written += await fillEmptyLines(tx, m, amounts)
    return written
  })
}
