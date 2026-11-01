import { dialog } from 'electron'
import { writeFileSync } from 'fs'
import { isIcsEntry, toIcs } from '../../shared/ics'
import { sanitizeFileName } from '../../shared/report-document'

export type IcsExportResult = { success: false } | { success: true; filePath: string; count: number }

/**
 * Saves the payment calendar as an .ics file where the user picks; entries arrive
 * translated from the renderer. Nothing leaves the machine: the user opens the file.
 * Throws: 'INVALID_INPUT', 'ICS_EXPORT_FAILED'
 */
export async function exportCalendarIcs(entries: unknown, calendarName: unknown, fileName: unknown, dialogTitle: unknown): Promise<IcsExportResult> {
  if (!Array.isArray(entries) || !entries.every(isIcsEntry) || typeof calendarName !== 'string') throw new Error('INVALID_INPUT')
  const name = sanitizeFileName(typeof fileName === 'string' && fileName.trim() ? fileName : 'calendar')
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: typeof dialogTitle === 'string' ? dialogTitle : undefined,
    defaultPath: `${name}.ics`,
    filters: [{ name: 'iCalendar', extensions: ['ics'] }],
  })
  if (canceled || !filePath) return { success: false }
  try {
    writeFileSync(filePath, toIcs(entries, calendarName), 'utf8')
  } catch (err) {
    console.error('[ICS] Save failed:', err)
    throw new Error('ICS_EXPORT_FAILED')
  }
  return { success: true, filePath, count: entries.length }
}
