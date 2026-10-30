import { describe, expect, it } from 'vitest'
import { accountTotals, overBudgetCategories } from './overview'
import { budgetGroup, budgetRow, type BudgetGroupRow } from './budget'
import type { AccountKind, AccountSummary } from './ledger'
import type { CategoryType } from './ledger'

const row = (id: string, plannedCents: number, actualCents: number) =>
  budgetRow({ id, name: id, icon: null, archived: false, carryOver: false, plannedCents, carriedInCents: 0, actualCents, previousActualCents: 0, suggestedCents: 0 })

const group = (type: CategoryType, categories: ReturnType<typeof row>[]): BudgetGroupRow =>
  budgetGroup({ id: type, name: type, type, icon: null, categories })

const account = (kind: AccountKind, balanceCents: number, archived = false) =>
  ({ kind, balanceCents, archived }) as AccountSummary

describe('overBudgetCategories', () => {
  it('should list outgoing categories past their plan, the furthest over first', () => {
    const groups = [
      group('INCOME', [row('salary', 100_000, 0)]),
      group('EXPENSE', [row('food', 10_000, 12_000), row('fuel', 5_000, 4_000), row('clothes', 1_000, 6_000)]),
      group('BILL', [row('power', 0, 3_000)]),
    ]
    expect(overBudgetCategories(groups).map(c => c.id)).toEqual(['clothes', 'power', 'food'])
  })

  it('should ignore income above its plan', () => {
    expect(overBudgetCategories([group('INCOME', [row('salary', 100, 0 - 500)])])).toEqual([])
  })

  it('should be empty with nothing over', () => {
    expect(overBudgetCategories([group('EXPENSE', [row('food', 10_000, 10_000)])])).toEqual([])
  })
})

describe('accountTotals', () => {
  it('should sum spendable money, keep meal vouchers apart and skip archived accounts', () => {
    const totals = accountTotals([
      account('CURRENT', 150_000),
      account('CREDIT_CARD', -40_000),
      account('CASH', 5_000),
      account('MEAL_VOUCHER', 12_000),
      account('SAVINGS', 99_999, true),
    ])
    expect(totals).toEqual({ spendableCents: 115_000, voucherCents: 12_000, count: 4 })
  })
})
