import { ipcMain } from 'electron'
import { getOverview } from '../services/overview'

export function registerOverviewHandlers(): void {
  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('overview:get', (_e, month: unknown) => getOverview(month))
}
