import { create } from 'zustand'
import type { AppNotification } from '../../../shared/notifications'

type NotificationsStore = {
  items: AppNotification[]
  loaded: boolean
  // Set when the last refresh failed; the panel offers Retry
  error: boolean
  // Per session, never persisted
  panelOpen: boolean
  refresh: () => Promise<void>
  setPanelOpen: (open: boolean) => void
  markRead: (keys: string[]) => Promise<void>
  markAllRead: () => Promise<void>
  dismiss: (key: string) => Promise<void>
  dismissAll: () => Promise<void>
}

/** Notifications are computed in main; every change goes through IPC and then refreshes the list */
export const useNotificationsStore = create<NotificationsStore>((set, get) => {
  const thenRefresh = (call: () => Promise<unknown>) => async () => {
    try {
      await call()
    } finally {
      await get().refresh()
    }
  }

  return {
    items: [],
    loaded: false,
    error: false,
    panelOpen: false,
    refresh: async () => {
      try {
        const items = await window.api.listNotifications()
        set({ items, loaded: true, error: false })
      } catch (err) {
        console.error('[notifications] refresh failed:', err)
        set({ loaded: true, error: true })
      }
    },
    setPanelOpen: open => set({ panelOpen: open }),
    markRead: async keys => {
      const unread = keys.filter(k => get().items.some(n => n.key === k && !n.read))
      if (unread.length === 0) return
      await thenRefresh(() => window.api.markNotificationsRead(unread))()
    },
    markAllRead: thenRefresh(() => window.api.markAllNotificationsRead()),
    dismiss: key => thenRefresh(() => window.api.dismissNotification(key))(),
    dismissAll: thenRefresh(() => window.api.dismissAllNotifications()),
  }
})

export const selectUnreadCount = (s: { items: AppNotification[] }) => s.items.filter(n => !n.read).length
