// Overview: the month at a glance. Types shared by main and renderer, and the
// pure sums behind the tiles. All amounts are integer cents.

import { sumMoney } from './money'
import { isOutgoing, type BudgetCategoryRow, type BudgetGroupRow, type BudgetMonth } from './budget'
import { isSpendable, type AccountSummary } from './ledger'
import type { UpcomingBill } from './recurrence'

export interface OverviewMonth {
  /** 'yyyy-MM' */
  month: string
  /** Every income row of the month, categorised or not; transfers never count */
  incomeCents: number
  /** Every expense row of the month, positive; refunds are income, not netted */
  spentCents: number
  budget: BudgetMonth
  /** Categories the household created itself (the starter list left out); ticks the setup step */
  ownCategoryCount: number
  /** Unpaid due dates: overdue ones and those in the next UPCOMING_DAYS, oldest first */
  upcoming: UpcomingBill[]
  /** Whether any active bill rule exists, for the card's empty state */
  hasRules: boolean
}

/** How far ahead the Overview's "Upcoming bills" card looks */
export const UPCOMING_DAYS = 14

/** Outgoing categories spent past what was available, the furthest over first */
export function overBudgetCategories(groups: BudgetGroupRow[]): BudgetCategoryRow[] {
  return groups
    .filter(g => isOutgoing(g.type))
    .flatMap(g => g.categories)
    .filter(c => c.leftCents < 0)
    .sort((a, b) => a.leftCents - b.leftCents)
}

/** Money in active accounts: spendable (cards count negative) and meal vouchers (food only), kept apart */
export function accountTotals(accounts: AccountSummary[]): { spendableCents: number; voucherCents: number; count: number } {
  const active = accounts.filter(a => !a.archived)
  return {
    spendableCents: sumMoney(active.filter(a => isSpendable(a.kind)).map(a => a.balanceCents)),
    voucherCents: sumMoney(active.filter(a => !isSpendable(a.kind)).map(a => a.balanceCents)),
    count: active.length,
  }
}
