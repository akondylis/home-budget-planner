import { BrowserWindow, ipcMain, nativeTheme } from 'electron'

export type ThemeMode = 'light' | 'dark' | 'system'

const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system']

export const TITLEBAR_HEIGHT = 36

// Matches --c-glass / --gray-700 in src/renderer/src/assets/theme.css
const OVERLAY = {
  light: { color: '#ffffff', symbolColor: '#374151' },
  dark: { color: '#121722', symbolColor: '#c5ccd6' },
}

/** Window background and Windows caption-button colours for the current OS/app theme. */
export function windowChrome(): { backgroundColor: string; overlay: { color: string; symbolColor: string; height: number } } {
  const dark = nativeTheme.shouldUseDarkColors
  return {
    backgroundColor: dark ? '#0b0f17' : '#f9fafb',
    overlay: { ...(dark ? OVERLAY.dark : OVERLAY.light), height: TITLEBAR_HEIGHT },
  }
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value)
}

export function registerWindowHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('window:setTheme', (_e, mode: unknown) => {
    if (!isThemeMode(mode)) throw new Error('INVALID_THEME_MODE')
    nativeTheme.themeSource = mode
  })

  // Fires for themeSource changes and OS theme changes while in 'system'
  nativeTheme.on('updated', () => {
    if (mainWindow.isDestroyed()) return
    const { backgroundColor, overlay } = windowChrome()
    mainWindow.setBackgroundColor(backgroundColor)
    if (process.platform !== 'darwin') mainWindow.setTitleBarOverlay(overlay)
  })
}
