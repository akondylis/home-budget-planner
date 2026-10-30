// Notifications (roadmap #8), ported from Matchday. Providers compute what needs a hand
// from the data each time the list is read; only read / hidden / toasted marks are stored.

import { prisma } from '../db/prisma'
import { mergeNotificationState, type AppNotification, type NotificationDraft } from '../../shared/notifications'

/** Computes the current notifications of one kind; never writes */
export type NotificationProvider = (now: Date) => Promise<NotificationDraft[]>

export type NotificationMark = 'readAt' | 'dismissedAt' | 'toastedAt'

const providers: NotificationProvider[] = []

export function registerNotificationProvider(provider: NotificationProvider): void {
  if (!providers.includes(provider)) providers.push(provider)
}

/**
 * Current notifications with their state, hidden ones left out. State rows whose
 * notification no longer exists (bill paid, month over) are pruned — but only when
 * every provider answered, so a failing provider never wipes its read/hidden marks.
 */
export async function collectNotifications(now = new Date()): Promise<AppNotification[]> {
  const results = await Promise.allSettled(providers.map(p => p(now)))
  const drafts = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
  for (const r of results) if (r.status === 'rejected') console.error('[notifications] provider failed:', r.reason)

  const states = await prisma.notificationState.findMany()
  if (results.every(r => r.status === 'fulfilled')) {
    const live = new Set(drafts.map(d => d.key))
    const stale = states.filter(s => !live.has(s.key)).map(s => s.key)
    if (stale.length > 0) await prisma.notificationState.deleteMany({ where: { key: { in: stale } } })
  }
  return mergeNotificationState(drafts, states)
}

/** Sets readAt / dismissedAt / toastedAt on the given keys, creating state rows as needed */
export async function markNotifications(keys: unknown, field: NotificationMark, at = new Date()): Promise<void> {
  const list = Array.isArray(keys) ? keys : []
  const unique = [...new Set(list.filter((k): k is string => typeof k === 'string' && k.length > 0))]
  if (unique.length === 0) return
  await prisma.$transaction(
    unique.map(key => prisma.notificationState.upsert({
      where: { key },
      create: { key, [field]: at },
      update: { [field]: at },
    })),
  )
}

export async function markAllRead(): Promise<void> {
  const unread = (await collectNotifications()).filter(n => !n.read).map(n => n.key)
  await markNotifications(unread, 'readAt')
}

export async function dismissAll(): Promise<void> {
  const visible = (await collectNotifications()).map(n => n.key)
  await markNotifications(visible, 'dismissedAt')
}
