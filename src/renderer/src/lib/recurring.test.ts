import { describe, expect, it } from 'vitest'
import {
  draftFromHint,
  draftToInput,
  emptyDraft,
  groupRules,
  groupUpcoming,
  monthlyTotals,
  pageRange,
  presetFor,
  scheduleLabel,
  validateDraft,
} from './recurring'
import type { PaymentStatus, RecurringRuleRow, UpcomingBill } from '../../../shared/recurrence'
import type { SubscriptionHint } from '../../../shared/statement-import'

const TODAY = '2026-10-20'

const bill = (dueDate: string, status: PaymentStatus, name = 'Netflix'): UpcomingBill => ({
  ruleId: name, name, categoryId: 'c', categoryType: 'SUBSCRIPTION', frequency: 'MONTH', interval: 1, dueDate,
  amountCents: -1_299, amountVaries: false, status, transactionId: null, paidBy: null, transactionText: null, transactionDate: null,
})

const rule = (over: Partial<RecurringRuleRow>): RecurringRuleRow => ({
  id: 'r', name: 'Rent', amountCents: 50_000, amountVaries: false, categoryId: 'c', categoryName: 'Rent', categoryType: 'BILL',
  accountId: null, accountName: null, memberId: null, frequency: 'MONTH', interval: 1, anchorDate: '2026-01-01', endsAt: null,
  matchText: null, archived: false, monthlyCents: 50_000, nextDue: '2026-11-01', ...over,
})

describe('schedule presets and labels', () => {
  it('should know the quick schedules and call anything else custom', () => {
    expect(presetFor('MONTH', 3)).toBe('MONTH_3')
    expect(presetFor('WEEK', 2)).toBe('WEEK_2')
    expect(presetFor('MONTH', 2)).toBe('CUSTOM')
  })

  it('should say "every 3 months" for a quarter and count the rest', () => {
    expect(scheduleLabel('MONTH', 3).key).toBe('recurring.every_quarter')
    expect(scheduleLabel('WEEK', 2)).toEqual({ key: 'recurring.every.WEEK', count: 2 })
  })
})

describe('the form draft', () => {
  it('should ask for a name, an amount above 0, a category and an end after the start', () => {
    const errors = validateDraft({ ...emptyDraft(TODAY), amount: '0', interval: '0', endsAt: '2026-01-01' })
    expect(errors).toEqual({ name: 'name_required', amount: 'amount_invalid', categoryId: 'category_required', interval: 'interval_invalid', endsAt: 'ends_before_start' })
  })

  it('should turn a valid draft into service input, empty fields as null', () => {
    const input = draftToInput({ ...emptyDraft(TODAY), name: ' Netflix ', amount: '12,99', categoryId: 'c', interval: '1' })
    expect(input).toMatchObject({ name: 'Netflix', amountCents: 1_299, accountId: null, endsAt: null, matchText: null, frequency: 'MONTH', interval: 1 })
  })

  it('should start a hint one interval after its last charge, clamped to the month end', () => {
    const hint: SubscriptionHint = { key: 'netflix', label: 'NETFLIX.COM', amountCents: 1_299, interval: 'MONTHLY', count: 4, lastDate: '2026-01-31', categoryId: null, transactionIds: [] }
    expect(draftFromHint(hint, '12,99', TODAY)).toMatchObject({ name: 'NETFLIX.COM', matchText: 'NETFLIX.COM', frequency: 'MONTH', anchorDate: '2026-02-28' })
    expect(draftFromHint({ ...hint, interval: 'YEARLY', lastDate: '2026-03-15' }, '12,99', TODAY).anchorDate).toBe('2027-03-15')
  })
})

describe('grouping', () => {
  it('should load a quarter back up to the end of next month', () => {
    expect(pageRange(TODAY)).toEqual({ from: '2026-07-19', to: '2026-11-30' })
  })

  it('should put overdue first, then this week, later this month, next month, then paid ones of this month', () => {
    const groups = groupUpcoming([
      bill('2026-09-05', 'PAID', 'old paid'),
      bill('2026-10-05', 'PAID', 'paid'),
      bill('2026-10-10', 'OVERDUE', 'late'),
      bill('2026-10-22', 'DUE', 'soon'),
      bill('2026-10-30', 'UPCOMING', 'month'),
      bill('2026-11-05', 'UPCOMING', 'next'),
    ], TODAY)
    expect(groups.map(g => [g.key, g.bills.map(b => b.name)])).toEqual([
      ['overdue', ['late']], ['week', ['soon']], ['month', ['month']], ['next', ['next']], ['done', ['paid']],
    ])
  })

  it('should group rules by type with income last, keep archived apart and sum the monthly cost', () => {
    const rules = [rule({ id: 'salary', categoryType: 'INCOME', monthlyCents: 200_000 }), rule({ id: 'netflix', categoryType: 'SUBSCRIPTION', monthlyCents: 1_299 }), rule({ id: 'old', archived: true })]
    const grouped = groupRules(rules)
    expect(grouped.active.map(g => g.type)).toEqual(['SUBSCRIPTION', 'INCOME'])
    expect(grouped.archived.map(r => r.id)).toEqual(['old'])
    expect(monthlyTotals(rules)).toEqual({ outCents: 1_299, inCents: 200_000 })
  })
})
