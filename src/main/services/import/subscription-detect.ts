// "Looks like a subscription": the same merchant charging about the same amount every
// month (or year), three times or more. Pure; services/subscriptions.ts loads the rows.

import { daysBetween } from './dedupe'
import type { CategoryType } from '../../../shared/ledger'
import type { SubscriptionHint, SubscriptionInterval } from '../../../shared/statement-import'

export interface ChargeRow {
  id: string
  bookedAt: string
  /** Negative: money out */
  amountCents: number
  /** payeeKey() of the row */
  key: string
  /** Name to show: the payee, else the merchant text */
  label: string
  categoryId: string | null
  categoryType: CategoryType | null
}

const MIN_CHARGES = 3
/** Same price within ±10% (a price rise or a currency rounding still counts) */
const AMOUNT_TOLERANCE = 0.1
const INTERVALS: Record<SubscriptionInterval, { min: number; max: number }> = {
  MONTHLY: { min: 26, max: 35 },
  YEARLY: { min: 350, max: 380 },
}
/** Already sorted as something that repeats: no hint */
const SETTLED: ReadonlySet<CategoryType> = new Set(['SUBSCRIPTION', 'BILL', 'DEBT', 'SAVINGS', 'INCOME'])

const similar = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * AMOUNT_TOLERANCE

/**
 * One hint per merchant whose latest charges repeat at a steady interval. Charges that
 * stopped (none within two intervals of `today`) are left out, so a cancelled one goes quiet.
 */
export function detectSubscriptions(rows: ChargeRow[], today: string): SubscriptionHint[] {
  const byKey = new Map<string, ChargeRow[]>()
  for (const row of rows) {
    if (!row.key || row.amountCents >= 0) continue
    byKey.set(row.key, [...(byKey.get(row.key) ?? []), row])
  }

  const hints: SubscriptionHint[] = []
  for (const [key, charges] of byKey) {
    const newestFirst = [...charges].sort((a, b) => b.bookedAt.localeCompare(a.bookedAt))
    const latest = newestFirst[0]
    if (latest.categoryType && SETTLED.has(latest.categoryType)) continue

    for (const interval of Object.keys(INTERVALS) as SubscriptionInterval[]) {
      const { min, max } = INTERVALS[interval]
      // Walk back from the newest charge while each step is one interval and the price holds
      const run = [latest]
      for (const row of newestFirst.slice(1)) {
        const gap = daysBetween(row.bookedAt, run[run.length - 1].bookedAt)
        if (gap < min) continue
        if (gap > max || !similar(row.amountCents, latest.amountCents)) break
        run.push(row)
      }
      if (run.length < MIN_CHARGES || daysBetween(latest.bookedAt, today) > 2 * max) continue
      hints.push({
        key,
        label: latest.label,
        amountCents: -latest.amountCents,
        interval,
        count: run.length,
        lastDate: latest.bookedAt,
        categoryId: latest.categoryId,
        transactionIds: run.map(r => r.id),
      })
      break
    }
  }
  return hints.sort((a, b) => b.amountCents - a.amountCents)
}
