import { z } from 'zod'
import { prisma } from '../db/prisma'
import { addMonths, isMonth, monthRange } from '../../shared/date-only'
import { monthlyByCategory } from './recurring'
import { CATEGORY_TYPES, type CategoryType } from '../../shared/ledger'
import {
  COPY_SOURCES,
  actualFromSum,
  budgetGroup,
  budgetRow,
  computeCarry,
  isOutgoing,
  roundUpToUnit,
  summariseBudget,
  type BudgetCategoryRow,
  type BudgetMonth,
} from '../../shared/budget'

const TYPE_ORDER = new Map<CategoryType, number>(CATEGORY_TYPES.map((t, i) => [t, i]))

const month = z.string().refine(isMonth)

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_INPUT')
  return parsed.data
}

/** Booked sum per category in a month (categorised rows only, so transfers never count) */
async function sumsByCategory(m: string): Promise<Map<string, number>> {
  const sums = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: { bookedAt: monthRange(m), categoryId: { not: null } },
    _sum: { amountCents: true },
  })
  return new Map(sums.map(s => [s.categoryId!, s._sum.amountCents ?? 0]))
}

/**
 * Unspent money carried into `m` for each carry-over category, chained month by month
 * from the first month it was planned.
 */
async function carriedInto(m: string, categories: Array<{ id: string; type: CategoryType }>): Promise<Map<string, number>> {
  const carried = new Map<string, number>()
  if (categories.length === 0) return carried
  const ids = categories.map(c => c.id)
  const lines = await prisma.budgetLine.findMany({
    where: { categoryId: { in: ids }, budget: { month: { lt: m } } },
    select: { categoryId: true, plannedCents: true, budget: { select: { month: true } } },
  })
  if (lines.length === 0) return carried
  const first = lines.reduce((min, l) => (l.budget.month < min ? l.budget.month : min), m)
  const rows = await prisma.transaction.findMany({
    where: { categoryId: { in: ids }, bookedAt: { gte: monthRange(first).gte, lt: monthRange(m).gte } },
    select: { categoryId: true, amountCents: true, bookedAt: true },
  })
  // category → month → cents
  const planned = new Map<string, Map<string, number>>()
  for (const l of lines) {
    const byMonth = planned.get(l.categoryId) ?? new Map<string, number>()
    byMonth.set(l.budget.month, l.plannedCents)
    planned.set(l.categoryId, byMonth)
  }
  const booked = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const key = r.bookedAt.toISOString().slice(0, 7)
    const byMonth = booked.get(r.categoryId!) ?? new Map<string, number>()
    byMonth.set(key, (byMonth.get(key) ?? 0) + r.amountCents)
    booked.set(r.categoryId!, byMonth)
  }
  for (const c of categories) {
    const plan = planned.get(c.id)
    if (!plan) continue
    const start = [...plan.keys()].sort()[0]
    const months: Array<{ plannedCents: number; actualCents: number }> = []
    for (let k = start; k < m; k = addMonths(k, 1)) {
      months.push({ plannedCents: plan.get(k) ?? 0, actualCents: actualFromSum(c.type, booked.get(c.id)?.get(k) ?? 0) })
    }
    carried.set(c.id, computeCarry(months))
  }
  return carried
}

/** Plan vs actual for one month, grouped like the Categories page. Throws: 'INVALID_INPUT' */
export async function getBudgetMonth(input: unknown): Promise<BudgetMonth> {
  const m = parse(month, input)
  const previous = addMonths(m, -1)
  const [budget, sums, previousSums, previousLines, uncategorisedCount, suggested] = await Promise.all([
    prisma.budget.findUnique({ where: { month: m }, include: { lines: true } }),
    sumsByCategory(m),
    sumsByCategory(previous),
    prisma.budgetLine.count({ where: { budget: { month: previous } } }),
    prisma.transaction.count({ where: { bookedAt: monthRange(m), categoryId: null, transferId: null } }),
    monthlyByCategory(),
  ])
  const planned = new Map((budget?.lines ?? []).map(l => [l.categoryId, l.plannedCents]))
  // Archived categories still show in a month they were planned or used in
  const used = [...new Set([...planned.keys(), ...sums.keys()])]
  const categories = await prisma.category.findMany({
    where: { OR: [{ archivedAt: null }, { id: { in: used } }, { children: { some: { id: { in: used } } } }] },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  const carry = await carriedInto(m, categories.filter(c => c.parentId !== null && c.carryOver && isOutgoing(c.type)))

  const rowsByGroup = new Map<string, BudgetCategoryRow[]>()
  let unplannedCount = 0
  let unplannedCents = 0
  for (const c of categories) {
    if (c.parentId === null) continue
    const row = budgetRow({
      id: c.id,
      name: c.name,
      icon: c.icon,
      archived: c.archivedAt !== null,
      carryOver: c.carryOver,
      plannedCents: planned.get(c.id) ?? 0,
      carriedInCents: carry.get(c.id) ?? 0,
      actualCents: actualFromSum(c.type, sums.get(c.id) ?? 0),
      previousActualCents: actualFromSum(c.type, previousSums.get(c.id) ?? 0),
      suggestedCents: suggested.get(c.id) ?? 0,
    })
    if (isOutgoing(c.type) && row.actualCents > 0 && row.availableCents === 0) {
      unplannedCount++
      unplannedCents += row.actualCents
    }
    rowsByGroup.set(c.parentId, [...(rowsByGroup.get(c.parentId) ?? []), row])
  }
  const groups = categories
    .filter(g => g.parentId === null && rowsByGroup.has(g.id))
    .sort((a, b) => TYPE_ORDER.get(a.type)! - TYPE_ORDER.get(b.type)! || a.sortOrder - b.sortOrder)
    .map(g => budgetGroup({ id: g.id, name: g.name, type: g.type, icon: g.icon, categories: rowsByGroup.get(g.id)! }))

  return {
    month: m,
    exists: planned.size > 0,
    updatedAt: planned.size > 0 && budget ? latest(budget.updatedAt, ...budget.lines.map(l => l.updatedAt)).toISOString() : null,
    summary: summariseBudget(groups),
    groups,
    unplannedCount,
    unplannedCents,
    uncategorisedCount,
    previousHasPlan: previousLines > 0,
    previousHasActual: previousSums.size > 0,
  }
}

const latest = (...dates: Date[]) => new Date(Math.max(...dates.map(d => d.getTime())))

/** A category (never a group) that can take a plan. Throws: 'CATEGORY_NOT_FOUND' */
async function assertPlannable(categoryId: string, allowArchived = false): Promise<void> {
  const found = await prisma.category.findUnique({ where: { id: categoryId }, select: { parentId: true, archivedAt: true } })
  if (!found || found.parentId === null || (found.archivedAt && !allowArchived)) throw new Error('CATEGORY_NOT_FOUND')
}

/**
 * Sets the planned amount of one category in one month; 0 removes the line.
 * Throws: 'INVALID_INPUT', 'INVALID_AMOUNT', 'CATEGORY_NOT_FOUND'
 */
export async function setPlanned(monthInput: unknown, categoryId: unknown, plannedCents: unknown): Promise<void> {
  const m = parse(month, monthInput)
  if (typeof categoryId !== 'string') throw new Error('INVALID_INPUT')
  if (typeof plannedCents !== 'number' || !Number.isSafeInteger(plannedCents) || plannedCents < 0) throw new Error('INVALID_AMOUNT')
  // Clearing the line of an archived category is allowed, so an old month can be tidied
  await assertPlannable(categoryId, plannedCents === 0)
  if (plannedCents === 0) {
    await prisma.budgetLine.deleteMany({ where: { categoryId, budget: { month: m } } })
    return
  }
  await prisma.$transaction(async tx => {
    const budget = await tx.budget.upsert({ where: { month: m }, create: { month: m }, update: {} })
    await tx.budgetLine.upsert({
      where: { budgetId_categoryId: { budgetId: budget.id, categoryId } },
      create: { budgetId: budget.id, categoryId, plannedCents },
      update: { plannedCents },
    })
  })
}

const copyInput = z.object({ from: month, to: month, source: z.enum(COPY_SOURCES) })

/**
 * Fills the empty lines of `to` from `from`'s plan, from its spending rounded up to whole
 * euros, or from the bills' monthly cost (`from` unused). Lines already planned are never overwritten. Returns how many lines were written.
 * Throws: 'INVALID_INPUT', 'BUDGET_SOURCE_EMPTY'
 */
export async function copyBudget(input: unknown): Promise<number> {
  const { from, to, source } = parse(copyInput, input)
  if (from === to) throw new Error('INVALID_INPUT')
  const active = await prisma.category.findMany({ where: { archivedAt: null, parentId: { not: null } }, select: { id: true, type: true } })
  const amounts = new Map<string, number>()
  if (source === 'PLAN') {
    const lines = await prisma.budgetLine.findMany({ where: { budget: { month: from }, categoryId: { in: active.map(c => c.id) } } })
    for (const l of lines) amounts.set(l.categoryId, l.plannedCents)
  } else if (source === 'RULES') {
    const ids = new Set(active.map(c => c.id))
    for (const [id, cents] of await monthlyByCategory()) if (ids.has(id) && cents > 0) amounts.set(id, cents)
  } else {
    const sums = await sumsByCategory(from)
    for (const c of active) {
      const cents = roundUpToUnit(actualFromSum(c.type, sums.get(c.id) ?? 0))
      if (cents > 0) amounts.set(c.id, cents)
    }
  }
  if (amounts.size === 0) throw new Error('BUDGET_SOURCE_EMPTY')

  return prisma.$transaction(async tx => {
    const budget = await tx.budget.upsert({ where: { month: to }, create: { month: to }, update: {} })
    const taken = new Set((await tx.budgetLine.findMany({ where: { budgetId: budget.id }, select: { categoryId: true } })).map(l => l.categoryId))
    const data = [...amounts].filter(([id]) => !taken.has(id)).map(([categoryId, plannedCents]) => ({ budgetId: budget.id, categoryId, plannedCents }))
    if (data.length) await tx.budgetLine.createMany({ data })
    return data.length
  })
}

/** Removes a month's whole plan. Throws: 'INVALID_INPUT' */
export async function clearBudget(monthInput: unknown): Promise<void> {
  const m = parse(month, monthInput)
  await prisma.budget.deleteMany({ where: { month: m } })
}
