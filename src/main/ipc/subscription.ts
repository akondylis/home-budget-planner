import { ipcMain } from 'electron'
import { listSubscriptionHints } from '../services/subscriptions'

export function registerSubscriptionHandlers(): void {
  ipcMain.handle('subscription:hints', () => listSubscriptionHints())
}
