import { z } from 'zod'
import { prisma } from '../db/prisma'
import { addDays, addMonths, dayRange } from '../../shared/date-only'
import { actualFromSum, isOutgoing } from '../../shared/budget'
import { isSpendable } from '../../shared/ledger'
import { HOUSEHOLD } from '../../shared/members'
import {
  COMPARE_MODES,
  MAX_TREND_COLUMNS,
  compareRangeFor,
  groupByQuarter,
  isRange,
  monthsIn,
  rankRows,
  type BalanceReport,
  type CategoryReport,
  type CategoryReportRow,
  type DateRange,
  type MemberReport,
  type TrendReport,
  type TrendRow,
} from '../../shared/reports'
import { parse, sumsByCategory } from './budgets'

const range = z.object({ from: z.string(), to: z.string() }).refine(isRange)
const categoryInput = z.object({
  range,
  compare: z.enum(COMPARE_MODES),
  direction: z.enum(['OUT', 'IN']),
  level: z.enum(['CATEGORY', 'GROUP']),
})
const memberInput = z.object({ range, compare: z.enum(COMPARE_MODES) })
const rangeInput = z.object({ range })

/** Rows of a period that are income or spending: never a transfer */
const notTransfer = (r: DateRange) => ({ bookedAt: dayRange(r.from, r.to), transferId: null })

/** Positive amount of the uncategorised rows going one way */
async function uncategorised(r: DateRange, direction: 'OUT' | 'IN'): Promise<number> {
  const sum = await prisma.transaction.aggregate({
    where: { ...notTransfer(r), categoryId: null, amountCents: direction === 'OUT' ? { lt: 0 } : { gt: 0 } },
    _sum: { amountCents: true },
  })
  return Math.abs(sum._sum.amountCents ?? 0)
}

/**
 * Spending (or income) per category or group over a period, with a comparison. A refund lowers its
 * category; rows with no category are a row of their own. Throws: 'INVALID_INPUT'
 */
export async function categoryReport(input: unknown): Promise<CategoryReport> {
  const { range: r, compare, direction, level } = parse(categoryInput, input)
  const other = compareRangeFor(compare, r)
  const [categories, sums, otherSums, loose, otherLoose] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, type: true, parentId: true, parent: { select: { name: true } } } }),
    sumsByCategory(dayRange(r.from, r.to)),
    other ? sumsByCategory(dayRange(other.from, other.to)) : null,
    uncategorised(r, direction),
    other ? uncategorised(other, direction) : null,
  ])

  const byId = new Map<string, CategoryReportRow>()
  for (const c of categories) {
    if (c.parentId === null || isOutgoing(c.type) !== (direction === 'OUT')) continue
    const cents = actualFromSum(c.type, sums.get(c.id) ?? 0)
    const compareCents = otherSums ? actualFromSum(c.type, otherSums.get(c.id) ?? 0) : null
    const key = level === 'GROUP' ? c.parentId : c.id
    const row = byId.get(key) ?? {
      id: key,
      name: level === 'GROUP' ? (c.parent?.name ?? c.name) : c.name,
      groupName: level === 'GROUP' ? null : (c.parent?.name ?? null),
      cents: 0,
      compareCents: otherSums ? 0 : null,
    }
    row.cents += cents
    if (compareCents !== null) row.compareCents = (row.compareCents ?? 0) + compareCents
    byId.set(key, row)
  }
  const rows = [...byId.values()].filter(row => row.cents > 0 || (row.compareCents ?? 0) > 0)
  if (loose > 0 || (otherLoose ?? 0) > 0) rows.push({ id: null, name: '', groupName: null, cents: loose, compareCents: otherLoose })
  const ranked = rankRows(rows)
  return {
    range: r,
    compare: other,
    direction,
    level,
    rows: ranked,
    totalCents: ranked.reduce((sum, row) => sum + Math.max(0, row.cents), 0),
    compareTotalCents: other ? ranked.reduce((sum, row) => sum + Math.max(0, row.compareCents ?? 0), 0) : null,
  }
}

/** Income and spending per month of a period (quarters past 24 months), as the Overview counts them. Throws: 'INVALID_INPUT' */
export async function trendReport(input: unknown): Promise<TrendReport> {
  const { range: r } = parse(rangeInput, input)
  const rows = await prisma.transaction.findMany({ where: notTransfer(r), select: { amountCents: true, bookedAt: true } })
  const months = monthsIn(r)
  // Each month's own days, cut to the period at both ends
  const byMonth = new Map<string, TrendRow>(months.map((m, i) => [m, {
    key: m,
    range: { from: i === 0 ? r.from : `${m}-01`, to: i === months.length - 1 ? r.to : addDays(`${addMonths(m, 1)}-01`, -1) },
    inCents: 0,
    outCents: 0,
    netCents: 0,
    count: 0,
  }]))
  for (const row of rows) {
    const bucket = byMonth.get(row.bookedAt.toISOString().slice(0, 7))
    if (!bucket) continue
    if (row.amountCents > 0) bucket.inCents += row.amountCents
    else bucket.outCents -= row.amountCents
    bucket.count++
  }
  const totals = [...byMonth.values()].map(b => ({ ...b, netCents: b.inCents - b.outCents }))
  return totals.length > MAX_TREND_COLUMNS ? { range: r, by: 'QUARTER', rows: groupByQuarter(totals) } : { range: r, by: 'MONTH', rows: totals }
}

/** Spending per member (the "For" of each row; Household for none), with each one's top categories. Throws: 'INVALID_INPUT' */
export async function memberReport(input: unknown): Promise<MemberReport> {
  const { range: r, compare } = parse(memberInput, input)
  const other = compareRangeFor(compare, r)
  const spending = (p: DateRange) => prisma.transaction.groupBy({ by: ['memberId'], where: { ...notTransfer(p), amountCents: { lt: 0 } }, _sum: { amountCents: true } })
  const [members, sums, otherSums, byCategory, categories] = await Promise.all([
    prisma.member.findMany({ select: { id: true, name: true, colour: true } }),
    spending(r),
    other ? spending(other) : null,
    prisma.transaction.groupBy({ by: ['memberId', 'categoryId'], where: { ...notTransfer(r), amountCents: { lt: 0 } }, _sum: { amountCents: true } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ])
  const memberOf = new Map(members.map(m => [m.id, m]))
  const categoryName = new Map(categories.map(c => [c.id, c.name]))
  const key = (memberId: string | null) => memberId ?? HOUSEHOLD
  const cents = new Map(sums.map(s => [key(s.memberId), 0 - (s._sum.amountCents ?? 0)]))
  const otherCents = otherSums ? new Map(otherSums.map(s => [key(s.memberId), 0 - (s._sum.amountCents ?? 0)])) : null

  const rows = [...new Set([...cents.keys(), ...(otherCents?.keys() ?? [])])].map(id => {
    const m = memberOf.get(id)
    const top = byCategory
      .filter(s => key(s.memberId) === id)
      .map(s => ({ id: s.categoryId, name: s.categoryId ? (categoryName.get(s.categoryId) ?? '') : '', cents: 0 - (s._sum.amountCents ?? 0) }))
    return {
      id,
      name: m?.name ?? null,
      colour: m?.colour ?? null,
      cents: cents.get(id) ?? 0,
      compareCents: otherCents ? (otherCents.get(id) ?? 0) : null,
      top: rankRows(top).slice(0, 5),
    }
  })
  const ranked = rankRows(rows)
  return {
    range: r,
    compare: other,
    rows: ranked,
    totalCents: ranked.reduce((sum, row) => sum + row.cents, 0),
    compareTotalCents: otherCents ? ranked.reduce((sum, row) => sum + (row.compareCents ?? 0), 0) : null,
  }
}

/** Money in accounts at each month end of a period, and each account's start and end. Throws: 'INVALID_INPUT' */
export async function balanceReport(input: unknown): Promise<BalanceReport> {
  const { range: r } = parse(rangeInput, input)
  const span = dayRange(r.from, r.to)
  const [accounts, before, rows] = await Promise.all([
    prisma.account.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, kind: true, openingBalanceCents: true, archivedAt: true } }),
    prisma.transaction.groupBy({ by: ['accountId'], where: { bookedAt: { lt: span.gte } }, _sum: { amountCents: true } }),
    prisma.transaction.findMany({ where: { bookedAt: span }, select: { accountId: true, amountCents: true, bookedAt: true } }),
  ])
  const start = new Map(accounts.map(a => [a.id, a.openingBalanceCents]))
  for (const b of before) start.set(b.accountId, (start.get(b.accountId) ?? 0) + (b._sum.amountCents ?? 0))

  const months = monthsIn(r)
  // account → month → booked in that month
  const moved = new Map<string, Map<string, number>>()
  const touched = new Set<string>()
  for (const row of rows) {
    const m = row.bookedAt.toISOString().slice(0, 7)
    const byMonth = moved.get(row.accountId) ?? new Map<string, number>()
    byMonth.set(m, (byMonth.get(m) ?? 0) + row.amountCents)
    moved.set(row.accountId, byMonth)
    touched.add(row.accountId)
  }

  const spendable = accounts.filter(a => isSpendable(a.kind))
  const running = new Map(accounts.map(a => [a.id, start.get(a.id) ?? 0]))
  const points = months.map(m => {
    for (const a of accounts) running.set(a.id, running.get(a.id)! + (moved.get(a.id)?.get(m) ?? 0))
    return { month: m, cents: spendable.reduce((sum, a) => sum + running.get(a.id)!, 0) }
  })
  return {
    range: r,
    startCents: spendable.reduce((sum, a) => sum + (start.get(a.id) ?? 0), 0),
    points,
    accounts: accounts
      .map(a => ({
        id: a.id,
        name: a.name,
        spendable: isSpendable(a.kind),
        archived: a.archivedAt !== null,
        startCents: start.get(a.id) ?? 0,
        endCents: running.get(a.id) ?? 0,
      }))
      // An archived account shows only for a period it held money or moved in
      .filter(a => !a.archived || a.startCents !== 0 || a.endCents !== 0 || touched.has(a.id)),
  }
}
