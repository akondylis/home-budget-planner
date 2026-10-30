import { prisma } from '../db/prisma'
import { monthRange } from '../../shared/date-only'
import { UPCOMING_DAYS, type OverviewMonth } from '../../shared/overview'
import { listUnpaid } from './recurring'
import { getBudgetMonth } from './budgets'
import { VOUCHER_CATEGORY } from './seed'

// The starter list is written in one go on first run; anything created after this is the household's own
const SEED_WINDOW_MS = 60_000

/** Active categories (groups included) the household created itself, not from the starter list */
export async function countOwnCategories(): Promise<number> {
  const first = await prisma.category.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
  if (!first) return 0
  return prisma.category.count({
    where: {
      archivedAt: null,
      createdAt: { gt: new Date(first.createdAt.getTime() + SEED_WINDOW_MS) },
      // Added later by the app to older databases, not by the household
      name: { notIn: Object.values(VOUCHER_CATEGORY) },
    },
  })
}

/** Income and spending of one month (transfers left out) with its budget. Throws: 'INVALID_INPUT' */
export async function getOverview(month: unknown): Promise<OverviewMonth> {
  const budget = await getBudgetMonth(month)
  const notTransfer = { bookedAt: monthRange(budget.month), transferId: null }
  const [income, expense, ownCategoryCount, upcoming, ruleCount] = await Promise.all([
    prisma.transaction.aggregate({ where: { ...notTransfer, amountCents: { gt: 0 } }, _sum: { amountCents: true } }),
    prisma.transaction.aggregate({ where: { ...notTransfer, amountCents: { lt: 0 } }, _sum: { amountCents: true } }),
    countOwnCategories(),
    listUnpaid(UPCOMING_DAYS),
    prisma.recurringRule.count({ where: { archivedAt: null } }),
  ])
  return {
    month: budget.month,
    incomeCents: income._sum.amountCents ?? 0,
    // 0 − x: an empty month is 0, never −0
    spentCents: 0 - (expense._sum.amountCents ?? 0),
    budget,
    ownCategoryCount,
    upcoming,
    hasRules: ruleCount > 0,
  }
}
