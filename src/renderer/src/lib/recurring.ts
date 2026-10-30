// Subscriptions & bills page: the form draft, its checks, and how due dates are grouped.
// Pure, so it is tested without the DOM.

import { addDays, addMonths, addMonthsToDate, dateToDateOnly, monthRange } from '../../../shared/date-only'
import { parseMoney } from '../../../shared/money'
import type { RecurringFrequency, RecurringRuleInput, RecurringRuleRow, UpcomingBill } from '../../../shared/recurrence'
import type { SubscriptionHint } from '../../../shared/statement-import'

/** Overdue dates further back than this are not listed (the rule was likely paid outside the app) */
export const OVERDUE_LOOKBACK_DAYS = 93
/** "This week" on the page */
export const WEEK_DAYS = 7

/** The form's quick schedules; anything else is "Custom" */
export const SCHEDULE_PRESETS = ['WEEK_1', 'WEEK_2', 'MONTH_1', 'MONTH_3', 'YEAR_1'] as const
export type SchedulePreset = (typeof SCHEDULE_PRESETS)[number] | 'CUSTOM'

export function presetFor(frequency: RecurringFrequency, interval: number): SchedulePreset {
  const key = `${frequency}_${interval}`
  return (SCHEDULE_PRESETS as readonly string[]).includes(key) ? (key as SchedulePreset) : 'CUSTOM'
}

export function presetSchedule(preset: Exclude<SchedulePreset, 'CUSTOM'>): { frequency: RecurringFrequency; interval: number } {
  const [frequency, interval] = preset.split('_')
  return { frequency: frequency as RecurringFrequency, interval: Number(interval) }
}

/** i18n key and count for "Every 3 months", "Every year", "Every 2 weeks" */
export function scheduleLabel(frequency: RecurringFrequency, interval: number): { key: string; count: number } {
  if (frequency === 'MONTH' && interval === 3) return { key: 'recurring.every_quarter', count: 1 }
  return { key: `recurring.every.${frequency}`, count: interval }
}

export interface RuleDraft {
  name: string
  amount: string
  amountVaries: boolean
  categoryId: string | null
  accountId: string
  memberId: string | null
  frequency: RecurringFrequency
  interval: string
  anchorDate: string
  endsAt: string
  matchText: string
  /** Non-monthly bills: turn on Carry over in the category so the monthly amount builds up */
  carryOver: boolean
}

export type RuleErrors = Partial<Record<'name' | 'amount' | 'categoryId' | 'interval' | 'anchorDate' | 'endsAt', string>>

export function emptyDraft(today: string): RuleDraft {
  return {
    name: '', amount: '', amountVaries: false, categoryId: null, accountId: '', memberId: null,
    frequency: 'MONTH', interval: '1', anchorDate: today, endsAt: '', matchText: '', carryOver: true,
  }
}

export function draftFromRule(rule: RecurringRuleRow, amountText: string): RuleDraft {
  return {
    name: rule.name,
    amount: amountText,
    amountVaries: rule.amountVaries,
    categoryId: rule.categoryId,
    accountId: rule.accountId ?? '',
    memberId: rule.memberId,
    frequency: rule.frequency,
    interval: String(rule.interval),
    anchorDate: rule.anchorDate,
    endsAt: rule.endsAt ?? '',
    matchText: rule.matchText ?? '',
    carryOver: false,
  }
}

/** A "looks like a subscription" hint as a new rule: first due date one interval after the last charge */
export function draftFromHint(hint: SubscriptionHint, amountText: string, today: string): RuleDraft {
  const yearly = hint.interval === 'YEARLY'
  // 31 Jan → 28 Feb: the shared helper clamps to the month's last day
  const anchor = addMonthsToDate(hint.lastDate, yearly ? 12 : 1)
  return {
    ...emptyDraft(today),
    name: hint.label,
    amount: amountText,
    categoryId: hint.categoryId,
    frequency: yearly ? 'YEAR' : 'MONTH',
    anchorDate: anchor,
    matchText: hint.label,
  }
}

export function validateDraft(d: RuleDraft): RuleErrors {
  const errors: RuleErrors = {}
  if (!d.name.trim()) errors.name = 'name_required'
  const amount = parseMoney(d.amount)
  if (amount === null || amount <= 0) errors.amount = 'amount_invalid'
  if (!d.categoryId) errors.categoryId = 'category_required'
  const interval = Number(d.interval)
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) errors.interval = 'interval_invalid'
  if (!d.anchorDate) errors.anchorDate = 'date_required'
  if (d.endsAt && d.anchorDate && d.endsAt < d.anchorDate) errors.endsAt = 'ends_before_start'
  return errors
}

/** Draft → service input; call after validateDraft found nothing */
export function draftToInput(d: RuleDraft): RecurringRuleInput {
  return {
    name: d.name.trim(),
    amountCents: parseMoney(d.amount) ?? 0,
    amountVaries: d.amountVaries,
    categoryId: d.categoryId!,
    accountId: d.accountId || null,
    memberId: d.memberId,
    frequency: d.frequency,
    interval: Number(d.interval),
    anchorDate: d.anchorDate,
    endsAt: d.endsAt || null,
    matchText: d.matchText.trim() || null,
  }
}

/** Dates the page loads: overdue ones a quarter back, up to the end of next month */
export function pageRange(today: string): { from: string; to: string } {
  const next = addMonths(today.slice(0, 7), 1)
  return { from: addDays(today, -OVERDUE_LOOKBACK_DAYS), to: addDays(dateToDateOnly(monthRange(next).lt), -1) }
}

export type UpcomingGroupKey = 'overdue' | 'week' | 'month' | 'next' | 'done'

export interface UpcomingGroup {
  key: UpcomingGroupKey
  bills: UpcomingBill[]
}

/**
 * Overdue first, then the next 7 days, the rest of this month and next month; paid and skipped
 * dates of this month (and paid early ones ahead) go last. Paid dates of past months are left out.
 */
export function groupUpcoming(bills: UpcomingBill[], today: string): UpcomingGroup[] {
  const month = today.slice(0, 7)
  const weekEnd = addDays(today, WEEK_DAYS)
  const groups: Record<UpcomingGroupKey, UpcomingBill[]> = { overdue: [], week: [], month: [], next: [], done: [] }
  for (const b of bills) {
    if (b.status === 'PAID' || b.status === 'SKIPPED') {
      if (b.dueDate >= `${month}-01`) groups.done.push(b)
    } else if (b.status === 'OVERDUE') groups.overdue.push(b)
    else if (b.dueDate < weekEnd) groups.week.push(b)
    else if (b.dueDate.slice(0, 7) === month) groups.month.push(b)
    else groups.next.push(b)
  }
  return (Object.keys(groups) as UpcomingGroupKey[]).filter(k => groups[k].length > 0).map(key => ({ key, bills: groups[key] }))
}

/** Rules for the "All bills" view: income last, archived apart */
export function groupRules(rules: RecurringRuleRow[]): { active: { type: string; rules: RecurringRuleRow[] }[]; archived: RecurringRuleRow[] } {
  const order = ['SUBSCRIPTION', 'BILL', 'EXPENSE', 'DEBT', 'SAVINGS', 'INCOME']
  const active = rules.filter(r => !r.archived)
  const types = [...new Set(active.map(r => r.categoryType))].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return {
    active: types.map(type => ({ type, rules: active.filter(r => r.categoryType === type) })),
    archived: rules.filter(r => r.archived),
  }
}

/** Monthly cost of the active outgoing rules, and the income ones apart */
export function monthlyTotals(rules: RecurringRuleRow[]): { outCents: number; inCents: number } {
  let outCents = 0
  let inCents = 0
  for (const r of rules) {
    if (r.archived) continue
    if (r.categoryType === 'INCOME') inCents += r.monthlyCents
    else outCents += r.monthlyCents
  }
  return { outCents, inCents }
}
