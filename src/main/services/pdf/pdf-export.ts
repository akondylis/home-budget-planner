import { dialog, shell } from 'electron'
import { writeFileSync } from 'fs'
import { generateReportPdf } from './report-pdf'
import { sanitizeFileName } from '../../../shared/report-document'

export type ExportResult = { success: false } | { success: true; filePath: string }

/**
 * Draws the report and saves it where the user picks (default: the report's name).
 * Throws: 'INVALID_REPORT', 'PDF_EXPORT_FAILED'
 */
export async function exportReportPdf(report: unknown, fileName: unknown, dialogTitle: unknown): Promise<ExportResult> {
  const buffer = await generateReportPdf(report)
  const name = sanitizeFileName(typeof fileName === 'string' && fileName.trim() ? fileName : 'report')
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: typeof dialogTitle === 'string' ? dialogTitle : undefined,
    defaultPath: `${name}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (canceled || !filePath) return { success: false }
  try {
    writeFileSync(filePath, buffer)
  } catch (err) {
    console.error('[PDF] Save failed:', err)
    throw new Error('PDF_EXPORT_FAILED')
  }
  return { success: true, filePath }
}

/**
 * Saves CSV text (built in the renderer, which has the translations) where the user picks.
 * Throws: 'INVALID_INPUT', 'CSV_EXPORT_FAILED'
 */
export async function saveCsv(content: unknown, fileName: unknown, dialogTitle: unknown): Promise<ExportResult> {
  if (typeof content !== 'string') throw new Error('INVALID_INPUT')
  const name = sanitizeFileName(typeof fileName === 'string' && fileName.trim() ? fileName : 'report')
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: typeof dialogTitle === 'string' ? dialogTitle : undefined,
    defaultPath: `${name}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })
  if (canceled || !filePath) return { success: false }
  try {
    writeFileSync(filePath, content, 'utf8')
  } catch (err) {
    console.error('[CSV] Save failed:', err)
    throw new Error('CSV_EXPORT_FAILED')
  }
  return { success: true, filePath }
}

/** Opens a file the app just saved (a PDF or a CSV) in its default program. Throws: 'OPEN_FILE_FAILED' */
export async function openSavedFile(filePath: unknown): Promise<void> {
  if (typeof filePath !== 'string' || !/\.(pdf|csv)$/i.test(filePath)) throw new Error('OPEN_FILE_FAILED')
  const error = await shell.openPath(filePath)
  if (error) throw new Error('OPEN_FILE_FAILED')
}
