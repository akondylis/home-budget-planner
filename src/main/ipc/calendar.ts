import { ipcMain } from 'electron'
import { exportCalendarIcs } from '../services/calendar-export'

export function registerCalendarHandlers(): void {
  /** Throws: 'INVALID_INPUT', 'ICS_EXPORT_FAILED' */
  ipcMain.handle('calendar:exportIcs', (_e, entries: unknown, calendarName: unknown, fileName: unknown, dialogTitle: unknown) =>
    exportCalendarIcs(entries, calendarName, fileName, dialogTitle))
}
