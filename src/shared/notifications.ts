// Notifications (roadmap #8), ported from Matchday. They are computed on demand by
// providers in the main process (see `src/main/services/notifications.ts`); only their
// read / hidden / toasted state is stored, keyed by `key`. Texts are i18n keys + params,
// translated in the renderer (and in main for Windows toasts).

import { daysBetween } from './date-only'
import { DUE_SOON_DAYS } from './recurrence'

export type NotificationSeverity = 'urgent' | 'warning' | 'info'

export type NotificationKind = 'bill-due' | 'bill-overdue' | 'income-late' | 'over-budget' | 'to-categorise' | 'import-stale'

/** Kinds about a due date; the rest are about the month or the data and group apart */
const DATED_KINDS: NotificationKind[] = ['bill-due', 'bill-overdue', 'income-late']

export type NotificationAction =
  | { kind: 'markPaid'; ruleId: string; dueDate: string }
  | { kind: 'skip'; ruleId: string; dueDate: string }
  | { kind: 'openBills' }
  | { kind: 'openBudget'; month: string }
  | { kind: 'openInbox' }
  | { kind: 'importStatement'; accountId: string }

/** What a provider returns; `read` is added from the stored state */
export interface NotificationDraft {
  /** Stable identity, e.g. `bill:<ruleId>:<dueDate>` */
  key: string
  kind: NotificationKind
  severity: NotificationSeverity
  /** Calendar day the notification is about, 'yyyy-MM-dd' (today for undated kinds) */
  date: string
  params: Record<string, string | number | null>
  /** The first one is the row's main button */
  actions: NotificationAction[]
}

export interface AppNotification extends NotificationDraft {
  read: boolean
  /** A Windows toast was shown for it */
  toasted: boolean
}

export interface NotificationStateRow {
  key: string
  readAt: Date | null
  dismissedAt: Date | null
  toastedAt: Date | null
}

export interface NotificationSettings {
  /** Days before a bill falls due that it shows; a rule can override it */
  leadDays: number
  toasts: boolean
}

/** Same as the Due status of a bill, so the bell and the bills list agree */
export const NOTIFY_LEAD_DAYS_DEFAULT = DUE_SOON_DAYS
/** Upper bound of a per-rule reminder (Settings offers up to 14) */
export const NOTIFY_LEAD_DAYS_MAX = 30
/** Choices in Settings and in the bill form */
export const LEAD_DAY_CHOICES = [0, 1, 2, 3, 5, 7, 14] as const
export const RULE_LEAD_DAY_CHOICES = [...LEAD_DAY_CHOICES, 30] as const
/** An account whose last imported statement ends this long ago gets a nudge */
export const IMPORT_STALE_DAYS = 30
/** More new toasts than this at once become one summary toast */
export const TOAST_SUMMARY_OVER = 3

export function isLeadDays(value: unknown, max = NOTIFY_LEAD_DAYS_MAX): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = { urgent: 0, warning: 1, info: 2 }

/** Most severe first, then the earliest date, then key for a stable order */
export function compareNotifications(a: NotificationDraft, b: NotificationDraft): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || a.date.localeCompare(b.date)
    || a.key.localeCompare(b.key)
}

/** Applies stored state: hidden ones are dropped, the rest get `read` and `toasted`, sorted for display */
export function mergeNotificationState(drafts: NotificationDraft[], states: NotificationStateRow[]): AppNotification[] {
  const byKey = new Map(states.map(s => [s.key, s]))
  return drafts
    .filter(d => !byKey.get(d.key)?.dismissedAt)
    .map(d => ({ ...d, read: !!byKey.get(d.key)?.readAt, toasted: !!byKey.get(d.key)?.toastedAt }))
    .sort(compareNotifications)
}

export type NotificationGroup = 'overdue' | 'soon' | 'other'

export const NOTIFICATION_GROUPS: NotificationGroup[] = ['overdue', 'soon', 'other']

/** Signed whole days from `today` to `date`; negative when past */
export function daysUntil(date: string, today: string): number {
  return date < today ? -daysBetween(date, today) : daysBetween(date, today)
}

/** Overdue = a due date passed, soon = a due date ahead, other = budget and data */
export function notificationGroup(n: NotificationDraft, today: string): NotificationGroup {
  if (!DATED_KINDS.includes(n.kind)) return 'other'
  return n.date < today ? 'overdue' : 'soon'
}

/** New toasts: unread, never toasted, urgent (due today, overdue) or late income. Above the limit they become one summary. */
export function pickToasts(items: AppNotification[]): { single: AppNotification[]; summary: AppNotification[] } {
  const fresh = items.filter(n => (n.severity === 'urgent' || n.kind === 'income-late') && !n.read && !n.toasted)
  return fresh.length > TOAST_SUMMARY_OVER ? { single: [], summary: fresh } : { single: fresh, summary: [] }
}
