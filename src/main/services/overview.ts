import { prisma } from '../db/prisma'
import { monthRange } from '../../shared/date-only'
import type { OverviewMonth } from '../../shared/overview'
import { getBudgetMonth } from './budgets'

/** Income and spending of one month (transfers left out) with its budget. Throws: 'INVALID_INPUT' */
export async function getOverview(month: unknown): Promise<OverviewMonth> {
  const budget = await getBudgetMonth(month)
  const notTransfer = { bookedAt: monthRange(budget.month), transferId: null }
  const [income, expense] = await Promise.all([
    prisma.transaction.aggregate({ where: { ...notTransfer, amountCents: { gt: 0 } }, _sum: { amountCents: true } }),
    prisma.transaction.aggregate({ where: { ...notTransfer, amountCents: { lt: 0 } }, _sum: { amountCents: true } }),
  ])
  return {
    month: budget.month,
    incomeCents: income._sum.amountCents ?? 0,
    // 0 − x: an empty month is 0, never −0
    spentCents: 0 - (expense._sum.amountCents ?? 0),
    budget,
  }
}
