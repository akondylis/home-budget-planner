// One wording for a notification, used by the bell (i18next in the renderer) and by
// Windows toasts (the same locale files read in main), so both always say the same.

import { formatMoney } from './money'
import { formatDate } from './date-format'
import { daysUntil, type NotificationDraft } from './notifications'

export type Translate = (key: string, params?: Record<string, string | number>) => string

/** "today", "tomorrow", "in 3 days", "2 days late" */
export function whenText(date: string, today: string, t: Translate): string {
  const days = daysUntil(date, today)
  if (days === 0) return t('notifications.when.today')
  if (days === 1) return t('notifications.when.tomorrow')
  if (days > 1) return t('notifications.when.in_days', { count: days })
  return t('notifications.when.late', { count: -days })
}

function amountText(cents: number, varies: boolean, t: Translate): string {
  const money = formatMoney(Math.abs(cents))
  return varies ? t('notifications.about', { amount: money }) : money
}

/** Headline and a short detail line */
export function notificationText(n: NotificationDraft, today: string, t: Translate): { title: string; detail: string } {
  const p = n.params
  const base = `notifications.kind.${n.kind}`
  switch (n.kind) {
    case 'bill-due':
    case 'bill-overdue':
    case 'instalment-due':
    case 'instalment-overdue':
    case 'income-late': {
      const values = {
        name: String(p.name),
        n: Number(p.n ?? 0),
        of: Number(p.of ?? 0),
        amount: amountText(Number(p.amountCents), p.amountVaries === 1, t),
        date: formatDate(String(p.dueDate)),
        when: whenText(n.date, today, t),
      }
      return { title: t(`${base}.title`, values), detail: t(`${base}.detail`, values) }
    }
    case 'over-budget': {
      const values = { name: String(p.name), over: formatMoney(Number(p.overCents)), available: formatMoney(Number(p.availableCents)) }
      return { title: t(`${base}.title`, values), detail: t(`${base}.detail`, values) }
    }
    case 'to-categorise': {
      const count = Number(p.count)
      return { title: t(`${base}.title`, { count }), detail: t(`${base}.detail`, { count }) }
    }
    case 'import-stale': {
      const values = { account: String(p.account), count: Number(p.days), date: formatDate(String(p.dateTo)) }
      return { title: t(`${base}.title`, values), detail: t(`${base}.detail`, values) }
    }
  }
}
