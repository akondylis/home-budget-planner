// What the bell shows (roadmap #8): bills and debt instalments due and overdue, late income, categories over
// their plan, rows waiting for a category and accounts not imported for a while. Each
// `compute*` is pure; the providers below only load what it needs.

import { prisma } from '../db/prisma'
import { dateToDateOnly, daysBetween, todayDateOnly } from '../../shared/date-only'
import { isOutgoing } from '../../shared/budget'
import {
  IMPORT_STALE_DAYS,
  NOTIFY_LEAD_DAYS_DEFAULT,
  NOTIFY_LEAD_DAYS_MAX,
  type NotificationDraft,
} from '../../shared/notifications'
import type { BudgetGroupRow } from '../../shared/budget'
import type { UpcomingBill } from '../../shared/recurrence'
import { listUnpaid } from './recurring'
import { getBudgetMonth } from './budgets'
import type { NotificationProvider } from './notifications'

/** Unpaid bills inside their reminder window or overdue, and income whose date passed unpaid */
export function computeBillNotifications(bills: UpcomingBill[], today: string, leadDays: number): NotificationDraft[] {
  const out: NotificationDraft[] = []
  for (const b of bills) {
    if (b.status === 'PAID' || b.status === 'SKIPPED') continue
    const late = b.dueDate < today
    const days = daysBetween(b.dueDate, today)
    const params = { name: b.name, amountCents: b.amountCents, amountVaries: b.amountVaries ? 1 : 0, dueDate: b.dueDate, days }
    const pay = { ruleId: b.ruleId, dueDate: b.dueDate }
    if (!isOutgoing(b.categoryType)) {
      // Income only needs a hand once its day has passed with nothing booked
      if (!late) continue
      out.push({
        key: `income:${b.ruleId}:${b.dueDate}`,
        kind: 'income-late',
        severity: 'warning',
        date: b.dueDate,
        params,
        actions: [{ kind: 'markPaid', ...pay }, { kind: 'skip', ...pay }, { kind: 'openBills' }],
      })
      continue
    }
    if (!late && days > (b.remindDays ?? leadDays)) continue
    if (b.debtId) {
      // A debt's instalment: same key and actions as a bill, worded as "instalment n of N"
      out.push({
        key: `bill:${b.ruleId}:${b.dueDate}`,
        kind: late ? 'instalment-overdue' : 'instalment-due',
        severity: late || days === 0 ? 'urgent' : 'warning',
        date: b.dueDate,
        params: { ...params, n: b.instalment?.n ?? null, of: b.instalment?.of ?? null },
        actions: [{ kind: 'markPaid', ...pay }, { kind: 'skip', ...pay }, { kind: 'openDebt', debtId: b.debtId }],
      })
      continue
    }
    out.push({
      key: `bill:${b.ruleId}:${b.dueDate}`,
      kind: late ? 'bill-overdue' : 'bill-due',
      severity: late || days === 0 ? 'urgent' : 'warning',
      date: b.dueDate,
      params,
      actions: [{ kind: 'markPaid', ...pay }, { kind: 'skip', ...pay }, { kind: 'openBills' }],
    })
  }
  return out
}

/** Planned outgoing categories spent past what was available this month; unplanned spending is the budget's own banner */
export function computeOverBudget(groups: BudgetGroupRow[], month: string, today: string): NotificationDraft[] {
  return groups
    .filter(g => isOutgoing(g.type))
    .flatMap(g => g.categories)
    .filter(c => c.availableCents > 0 && c.leftCents < 0)
    .map(c => ({
      key: `budget:${month}:${c.id}`,
      kind: 'over-budget' as const,
      severity: 'warning' as const,
      date: today,
      params: { name: c.name, overCents: -c.leftCents, availableCents: c.availableCents, month },
      actions: [{ kind: 'openBudget' as const, month }],
    }))
}

/** One nudge for the rows waiting for a category; keyed by the newest so new rows bring a hidden one back */
export function computeToCategorise(count: number, newestId: string | null, today: string): NotificationDraft[] {
  if (count === 0 || !newestId) return []
  return [{
    key: `categorise:${newestId}`,
    kind: 'to-categorise',
    severity: 'info',
    date: today,
    params: { count },
    actions: [{ kind: 'openInbox' }],
  }]
}

export interface LastImport {
  accountId: string
  accountName: string
  batchId: string
  /** Last day the statement covered, 'yyyy-MM-dd' */
  dateTo: string
}

/** Accounts whose last imported statement ends IMPORT_STALE_DAYS or more ago; keyed by that import */
export function computeImportStale(imports: LastImport[], today: string): NotificationDraft[] {
  return imports
    .filter(i => i.dateTo < today && daysBetween(i.dateTo, today) >= IMPORT_STALE_DAYS)
    .map(i => ({
      key: `import:${i.accountId}:${i.batchId}`,
      kind: 'import-stale' as const,
      severity: 'info' as const,
      date: today,
      params: { account: i.accountName, days: daysBetween(i.dateTo, today), dateTo: i.dateTo },
      actions: [{ kind: 'importStatement' as const, accountId: i.accountId }],
    }))
}

// ── Providers ────────────────────────────────────────────────────────────────

export const billProvider: NotificationProvider = async now => {
  const today = todayDateOnly(now)
  const [bills, settings] = await Promise.all([
    listUnpaid(NOTIFY_LEAD_DAYS_MAX, today),
    prisma.appSettings.findUnique({ where: { id: 1 }, select: { notifyLeadDays: true } }),
  ])
  return computeBillNotifications(bills, today, settings?.notifyLeadDays ?? NOTIFY_LEAD_DAYS_DEFAULT)
}

export const budgetProvider: NotificationProvider = async now => {
  const today = todayDateOnly(now)
  const month = today.slice(0, 7)
  const budget = await getBudgetMonth(month)
  return computeOverBudget(budget.groups, month, today)
}

export const categoriseProvider: NotificationProvider = async now => {
  const where = { categoryId: null, transferId: null }
  const [count, newest] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findFirst({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } }),
  ])
  return computeToCategorise(count, newest?.id ?? null, todayDateOnly(now))
}

export const importProvider: NotificationProvider = async now => {
  const batches = await prisma.importBatch.findMany({
    where: { undoneAt: null, account: { archivedAt: null } },
    orderBy: [{ dateTo: 'desc' }, { importedAt: 'desc' }],
    select: { id: true, accountId: true, dateTo: true, account: { select: { name: true } } },
  })
  const latest = new Map<string, LastImport>()
  for (const b of batches) {
    if (!latest.has(b.accountId)) latest.set(b.accountId, { accountId: b.accountId, accountName: b.account.name, batchId: b.id, dateTo: dateToDateOnly(b.dateTo) })
  }
  return computeImportStale([...latest.values()], todayDateOnly(now))
}

export const NOTIFICATION_PROVIDERS: NotificationProvider[] = [billProvider, budgetProvider, categoriseProvider, importProvider]
