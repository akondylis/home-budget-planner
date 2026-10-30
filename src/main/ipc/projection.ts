import { ipcMain } from 'electron'
import { getProjection } from '../services/projections'

export function registerProjectionHandlers(): void {
  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('projection:get', (_e, months: unknown) => getProjection(months))
}
