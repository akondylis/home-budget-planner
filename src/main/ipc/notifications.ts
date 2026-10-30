import { ipcMain } from 'electron'
import { collectNotifications, dismissAll, markAllRead, markNotifications } from '../services/notifications'

export function registerNotificationHandlers(): void {
  ipcMain.handle('notification:list', () => collectNotifications())

  ipcMain.handle('notification:markRead', (_e, keys: unknown) => markNotifications(keys, 'readAt'))

  ipcMain.handle('notification:markAllRead', () => markAllRead())

  ipcMain.handle('notification:dismiss', (_e, key: unknown) => markNotifications([key], 'dismissedAt'))

  ipcMain.handle('notification:dismissAll', () => dismissAll())
}
