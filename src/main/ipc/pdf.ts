import { ipcMain } from 'electron'
import { exportReportPdf, openSavedFile } from '../services/pdf/pdf-export'

export function registerPdfHandlers(): void {
  /** Throws: 'INVALID_REPORT', 'PDF_EXPORT_FAILED' */
  ipcMain.handle('pdf:export', (_e, report: unknown, fileName: unknown, dialogTitle: unknown) =>
    exportReportPdf(report, fileName, dialogTitle))

  /** Throws: 'OPEN_FILE_FAILED' */
  ipcMain.handle('shell:openFile', (_e, filePath: unknown) => openSavedFile(filePath))
}
