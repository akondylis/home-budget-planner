import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { join } from 'path'
import { registerWindowHandlers, windowChrome } from './ipc/window'
import { dbPath } from './db/db-path'
import { isDataDirWritable, isPortable } from './user-data'

let prismaInstance: { $disconnect: () => Promise<void> } | null = null
let sqliteInstance: { pragma: (s: string) => unknown; close: () => void } | null = null

/**
 * The window has no visible menu, but Electron's default one still binds Ctrl+W
 * (close window) and its own zoom. Keep only edit, reload, devtools and
 * fullscreen; the renderer owns zoom.
 */
function setAppMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] },
  ]))
}

// Frameless window: the renderer draws the titlebar (drag region) and Windows
// keeps its native caption buttons via titleBarOverlay, recoloured per theme.
function createMainWindow(): BrowserWindow {
  const { backgroundColor, overlay } = windowChrome()
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor,
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin' ? { titleBarOverlay: overlay } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })
  // target="_blank" links open in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  return win
}

// Windows shows toasts under this id (the installer's appId)
if (process.platform === 'win32') app.setAppUserModelId('com.akondylis.homebudget')

app.whenReady().then(async () => {
  // Portable edition: refuse a read-only stick instead of losing writes, then keep a startup copy
  if (isPortable()) {
    const dataDir = app.getPath('userData')
    if (!isDataDirWritable(dataDir)) {
      dialog.showErrorBox(
        'Home Budget',
        `Ο φάκελος δεδομένων είναι μόνο για ανάγνωση:
${dataDir}

Αντιγράψτε τον φάκελο HomeBudget σε μονάδα με δικαίωμα εγγραφής.

` +
        `The data folder is read-only:
${dataDir}

Copy the HomeBudget folder to a writable drive.`,
      )
      app.exit(1)
      return
    }
    const { writeStartupCopy } = await import('./db/startup-backup')
    writeStartupCopy(dbPath)
  }

  // Migrations run before any Prisma connection opens
  const { runMigrations } = await import('./db/migrate')
  runMigrations()

  const { prisma, sqlite } = await import('./db/prisma')
  prismaInstance = prisma
  sqliteInstance = sqlite
  const { applyStoredFormatting } = await import('./services/settings')
  const { registerSettingsHandlers } = await import('./ipc/settings')
  const { registerPdfHandlers } = await import('./ipc/pdf')
  const { registerMemberHandlers } = await import('./ipc/member')
  const { registerInstitutionHandlers } = await import('./ipc/institution')
  const { registerAccountHandlers } = await import('./ipc/account')
  const { registerCategoryHandlers } = await import('./ipc/category')
  const { registerTransactionHandlers } = await import('./ipc/transaction')
  const { registerImportHandlers } = await import('./ipc/import')
  const { registerRuleHandlers } = await import('./ipc/rule')
  const { registerSubscriptionHandlers } = await import('./ipc/subscription')
  const { registerBudgetHandlers } = await import('./ipc/budget')
  const { registerOverviewHandlers } = await import('./ipc/overview')
  const { registerRecurringHandlers } = await import('./ipc/recurring')
  const { registerNotificationHandlers } = await import('./ipc/notifications')
  const { registerNotificationProvider } = await import('./services/notifications')
  const { NOTIFICATION_PROVIDERS } = await import('./services/notification-providers')
  const { startNotificationToasts } = await import('./services/notification-toasts')
  const { seedDefaults } = await import('./services/seed')

  const settings = await applyStoredFormatting()
  await seedDefaults(settings.language === 'en' ? 'en' : 'el')

  setAppMenu()
  const mainWindow = createMainWindow()
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    startNotificationToasts(mainWindow)
  })

  registerSettingsHandlers()
  registerPdfHandlers()
  registerMemberHandlers()
  registerInstitutionHandlers()
  registerAccountHandlers()
  registerCategoryHandlers()
  registerTransactionHandlers()
  registerImportHandlers()
  registerRuleHandlers()
  registerSubscriptionHandlers()
  registerBudgetHandlers()
  registerOverviewHandlers()
  registerRecurringHandlers()
  registerNotificationHandlers()
  for (const provider of NOTIFICATION_PROVIDERS) registerNotificationProvider(provider)
  registerWindowHandlers(mainWindow)

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}).catch(err => {
  console.error('[STARTUP] Fatal error during app initialization:', err)
  process.exit(1)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', async event => {
  // Close the database cleanly before the process exits
  event.preventDefault()
  try {
    await prismaInstance?.$disconnect()
    if (sqliteInstance) {
      // The portable edition uses DELETE journaling: there is no WAL to fold back
      if (!isPortable()) sqliteInstance.pragma('wal_checkpoint(TRUNCATE)')
      sqliteInstance.close()
    }
  } catch (err) {
    console.error('[SHUTDOWN] Error while closing the database:', err)
  }
  process.exit(0)
})
