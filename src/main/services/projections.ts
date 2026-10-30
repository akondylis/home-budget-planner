import { z } from 'zod'
import { prisma } from '../db/prisma'
import { addMonths, dateToDateOnly, monthRange, todayDateOnly } from '../../shared/date-only'
import { accountTotals } from '../../shared/overview'
import { actualFromSum } from '../../shared/budget'
import { HORIZONS, projectMonths, type Projection } from '../../shared/projection'
import { listAccounts } from './accounts'
import { parse, sumsByCategory } from './budgets'

const horizon = z.number().refine(n => (HORIZONS as readonly number[]).includes(n))

/**
 * Month-end balances from today over the next `months` months: today's money (meal vouchers
 * apart), the active rules on their due dates and the budget plan. Throws: 'INVALID_INPUT'
 */
export async function getProjection(input: unknown, today: string = todayDateOnly()): Promise<Projection> {
  const months = parse(horizon, input)
  const current = today.slice(0, 7)
  const last = addMonths(current, months - 1)

  const [accounts, rules, categories, before, sums] = await Promise.all([
    listAccounts(),
    prisma.recurringRule.findMany({
      where: { archivedAt: null },
      select: { name: true, categoryId: true, amountCents: true, frequency: true, interval: true, anchorDate: true, endsAt: true },
    }),
    prisma.category.findMany({ where: { parentId: { not: null }, archivedAt: null }, select: { id: true, name: true, type: true } }),
    // The plan a month with none of its own repeats may be older than this month
    prisma.budget.findFirst({ where: { month: { lt: current }, lines: { some: {} } }, orderBy: { month: 'desc' }, select: { month: true } }),
    sumsByCategory(monthRange(current)),
  ])
  const lines = await prisma.budgetLine.findMany({
    where: { budget: { month: { gte: before?.month ?? current, lte: last } } },
    select: { categoryId: true, plannedCents: true, budget: { select: { month: true } } },
  })

  const plans = new Map<string, Map<string, number>>()
  for (const l of lines) {
    const byCategory = plans.get(l.budget.month) ?? new Map<string, number>()
    byCategory.set(l.categoryId, l.plannedCents)
    plans.set(l.budget.month, byCategory)
  }
  const totals = accountTotals(accounts)
  return projectMonths({
    today,
    startCents: totals.spendableCents,
    accountCount: totals.count,
    months,
    categories: new Map(categories.map(c => [c.id, { name: c.name, type: c.type }])),
    rules: rules.map(r => ({
      name: r.name,
      categoryId: r.categoryId,
      amountCents: r.amountCents,
      schedule: { frequency: r.frequency, interval: r.interval, anchorDate: dateToDateOnly(r.anchorDate), endsAt: r.endsAt ? dateToDateOnly(r.endsAt) : null },
    })),
    plans,
    actualSoFar: new Map(categories.map(c => [c.id, actualFromSum(c.type, sums.get(c.id) ?? 0)])),
  })
}
