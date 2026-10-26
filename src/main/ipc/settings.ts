import { app, ipcMain, shell } from 'electron'
import { getSettings, saveDateFormat, setLanguage } from '../services/settings'
import { isPortable } from '../user-data'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => getSettings())

  /** Throws: 'INVALID_LANGUAGE' */
  ipcMain.handle('settings:setLanguage', (_e, lang: unknown) => setLanguage(lang))

  /** Throws: 'INVALID_DATE_FORMAT' */
  ipcMain.handle('settings:setDateFormat', (_e, format: unknown) => saveDateFormat(format))

  // Where the data lives and which edition runs (title bar badge, Settings → About)
  ipcMain.handle('settings:appInfo', () => ({ portable: isPortable(), dataDir: app.getPath('userData') }))

  /** Throws: 'OPEN_DATA_DIR_FAILED' */
  ipcMain.handle('settings:openDataDir', async () => {
    const error = await shell.openPath(app.getPath('userData'))
    if (error) throw new Error('OPEN_DATA_DIR_FAILED')
  })
}
