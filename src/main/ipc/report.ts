import { ipcMain } from 'electron'
import { balanceReport, categoryReport, memberReport, trendReport } from '../services/reports'
import { saveCsv } from '../services/pdf/pdf-export'

export function registerReportHandlers(): void {
  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('report:categories', (_e, input: unknown) => categoryReport(input))

  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('report:trend', (_e, input: unknown) => trendReport(input))

  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('report:members', (_e, input: unknown) => memberReport(input))

  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('report:balances', (_e, input: unknown) => balanceReport(input))

  /** Throws: 'INVALID_INPUT', 'CSV_EXPORT_FAILED' */
  ipcMain.handle('report:saveCsv', (_e, content: unknown, fileName: unknown, dialogTitle: unknown) => saveCsv(content, fileName, dialogTitle))
}
