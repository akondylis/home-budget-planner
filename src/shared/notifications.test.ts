import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  mergeNotificationState,
  notificationGroup,
  pickToasts,
  type AppNotification,
  type NotificationDraft,
} from './notifications'
import { notificationText, whenText } from './notification-text'

const draft = (over: Partial<NotificationDraft>): NotificationDraft => ({
  key: 'k', kind: 'bill-due', severity: 'warning', date: '2026-10-22', params: {}, actions: [], ...over,
})

const app = (over: Partial<AppNotification>): AppNotification => ({ ...draft(over), read: false, toasted: false, ...over })

// Echoes the key and its params, so the tests read what was asked for
const t = (key: string, params: Record<string, string | number> = {}) =>
  `${key}${Object.keys(params).length ? JSON.stringify(params) : ''}`

describe('mergeNotificationState', () => {
  it('should drop hidden ones, mark read and toasted, and sort most severe then earliest first', () => {
    const merged = mergeNotificationState(
      [draft({ key: 'b', severity: 'warning', date: '2026-10-21' }), draft({ key: 'a', severity: 'urgent', date: '2026-10-25' }), draft({ key: 'h' })],
      [
        { key: 'a', readAt: new Date(), dismissedAt: null, toastedAt: new Date() },
        { key: 'h', readAt: null, dismissedAt: new Date(), toastedAt: null },
      ],
    )
    expect(merged.map(n => [n.key, n.read, n.toasted])).toEqual([['a', true, true], ['b', false, false]])
  })
})

describe('groups and days', () => {
  it('should count signed days and group dated kinds by date, the rest apart', () => {
    expect(daysUntil('2026-10-18', '2026-10-20')).toBe(-2)
    expect(daysUntil('2026-10-23', '2026-10-20')).toBe(3)
    expect(notificationGroup(draft({ kind: 'bill-overdue', date: '2026-10-18' }), '2026-10-20')).toBe('overdue')
    expect(notificationGroup(draft({ kind: 'bill-due', date: '2026-10-20' }), '2026-10-20')).toBe('soon')
    expect(notificationGroup(draft({ kind: 'over-budget', date: '2026-10-20' }), '2026-10-20')).toBe('other')
  })

  it('should say today, tomorrow, in N days and N days late', () => {
    expect(whenText('2026-10-20', '2026-10-20', t)).toBe('notifications.when.today')
    expect(whenText('2026-10-21', '2026-10-20', t)).toBe('notifications.when.tomorrow')
    expect(whenText('2026-10-25', '2026-10-20', t)).toBe('notifications.when.in_days{"count":5}')
    expect(whenText('2026-10-17', '2026-10-20', t)).toBe('notifications.when.late{"count":3}')
  })

  it('should word a to-categorise nudge with its count', () => {
    const text = notificationText(draft({ kind: 'to-categorise', params: { count: 4 } }), '2026-10-20', t)
    expect(text.title).toBe('notifications.kind.to-categorise.title{"count":4}')
  })
})

describe('pickToasts', () => {
  it('should toast urgent and late-income ones once, unread only', () => {
    const { single, summary } = pickToasts([
      app({ key: 'u', severity: 'urgent' }),
      app({ key: 'i', kind: 'income-late', severity: 'warning' }),
      app({ key: 'w', severity: 'warning' }),
      app({ key: 'r', severity: 'urgent', read: true }),
      app({ key: 't', severity: 'urgent', toasted: true }),
    ])
    expect(single.map(n => n.key)).toEqual(['u', 'i'])
    expect(summary).toEqual([])
  })

  it('should fold more than three into one summary', () => {
    const many = ['a', 'b', 'c', 'd'].map(key => app({ key, severity: 'urgent' }))
    expect(pickToasts(many)).toEqual({ single: [], summary: many })
  })
})
