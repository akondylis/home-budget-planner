// Bell helpers: action labels and icons, and the panel's groups.
import type { TFunction } from 'i18next'
import {
  NOTIFICATION_GROUPS,
  notificationGroup,
  type AppNotification,
  type NotificationAction,
  type NotificationGroup,
  type NotificationKind,
} from '../../../shared/notifications'
import type { IconName } from '../components/shell/icons'

export const ACTION_ICONS: Record<NotificationAction['kind'], IconName> = {
  markPaid: 'check',
  skip: 'minus',
  openBills: 'repeat',
  openDebt: 'credit-card',
  openBudget: 'target',
  openInbox: 'tag',
  importStatement: 'download',
}

export const KIND_ICONS: Record<NotificationKind, IconName> = {
  'bill-due': 'calendar',
  'bill-overdue': 'alert-triangle',
  'instalment-due': 'credit-card',
  'instalment-overdue': 'alert-triangle',
  'income-late': 'alert-triangle',
  'over-budget': 'target',
  'to-categorise': 'tag',
  'import-stale': 'download',
}

/** Late or due today in red, due soon in amber, the rest neutral; the icon carries the meaning too */
export function kindTone(n: AppNotification): string {
  if (n.severity === 'urgent') return 'text-red-700'
  if (n.severity === 'warning') return 'text-amber-700'
  return 'text-gray-500'
}

export function actionLabel(action: NotificationAction, n: AppNotification, t: TFunction): string {
  if (action.kind === 'markPaid' && n.kind === 'income-late') return t('notifications.action.markReceived')
  return t(`notifications.action.${action.kind}`)
}

/** Non-empty groups in panel order */
export function groupNotifications(items: AppNotification[], today: string): { group: NotificationGroup; items: AppNotification[] }[] {
  return NOTIFICATION_GROUPS
    .map(group => ({ group, items: items.filter(n => notificationGroup(n, today) === group) }))
    .filter(g => g.items.length > 0)
}

/** "On the day", "3 days before" */
export function leadDaysLabel(days: number, t: TFunction): string {
  return days === 0 ? t('notifications.settings.lead_0') : t('notifications.settings.lead_days', { count: days })
}
