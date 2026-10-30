// Windows toasts for notifications (roadmap #8): while the app is open, each bill due today,
// overdue bill or late income pops up once (toastedAt is stored); more than a few at once
// become one summary. Clicking a toast brings the window back with the bell's panel open.

import { BrowserWindow, Notification } from 'electron'
import { prisma } from '../db/prisma'
import { todayDateOnly } from '../../shared/date-only'
import { pickToasts } from '../../shared/notifications'
import { notificationText, type Translate } from '../../shared/notification-text'
import en from '../../renderer/src/i18n/en.json'
import el from '../../renderer/src/i18n/el.json'
import { collectNotifications, markNotifications } from './notifications'

const FIRST_CHECK_MS = 5_000
// Hourly catches the day changing while the app stays open
const CHECK_EVERY_MS = 60 * 60 * 1000

type Messages = Record<string, unknown>

/** The i18next lookup the toasts need: dotted keys, {{param}} and _one/_other plurals */
export function translator(messages: Messages): Translate {
  const lookup = (key: string): string | undefined => {
    let node: unknown = messages
    for (const part of key.split('.')) {
      if (node === null || typeof node !== 'object') return undefined
      node = (node as Messages)[part]
    }
    return typeof node === 'string' ? node : undefined
  }
  return (key, params = {}) => {
    const count = params.count
    const plural = typeof count === 'number' ? lookup(`${key}_${count === 1 ? 'one' : 'other'}`) : undefined
    const text = plural ?? lookup(key) ?? key
    return text.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params[name] ?? ''))
  }
}

/** Shows the toasts not shown yet. Returns how many were shown. */
export async function showDueToasts(win: BrowserWindow, now = new Date()): Promise<number> {
  if (!Notification.isSupported()) return 0
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { notifyToasts: true, language: true } })
  if (!settings?.notifyToasts) return 0

  const { single, summary } = pickToasts(await collectNotifications(now))
  const t = translator(settings.language === 'en' ? en : el)
  const today = todayDateOnly(now)
  const open = (key: string | null) => {
    if (win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send('notification:open', key)
  }

  for (const n of single) {
    const { title, detail } = notificationText(n, today, t)
    const toast = new Notification({ title, body: detail })
    toast.on('click', () => open(n.key))
    toast.show()
  }
  if (summary.length > 0) {
    const toast = new Notification({
      title: t('notifications.toast.summary_title', { count: summary.length }),
      body: t('notifications.toast.summary_body'),
    })
    toast.on('click', () => open(null))
    toast.show()
  }
  const shown = [...single, ...summary]
  await markNotifications(shown.map(n => n.key), 'toastedAt', now)
  return shown.length
}

/** First check shortly after launch, then hourly; returns a stop function */
export function startNotificationToasts(win: BrowserWindow): () => void {
  const run = () => void showDueToasts(win).catch(err => console.error('[notifications] toasts failed:', err))
  const first = setTimeout(run, FIRST_CHECK_MS)
  const every = setInterval(run, CHECK_EVERY_MS)
  return () => {
    clearTimeout(first)
    clearInterval(every)
  }
}
