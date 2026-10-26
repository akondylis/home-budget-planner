/// <reference types="vite/client" />

// Injected by electron.vite.config.ts from package.json
declare const __APP_VERSION__: string

interface Window {
  api: {
    getSettings:   () => Promise<import('./types').AppSettings | null>
    setLanguage:   (l: import('./types').AppLanguage) => Promise<void>
    setDateFormat: (f: import('./lib/date-format').DateFormat) => Promise<void>
    getAppInfo:    () => Promise<{ portable: boolean; dataDir: string }>
    openDataDir:   () => Promise<void>

    exportPdf:     (report: import('../../shared/report-document').ReportDocument, fileName: string, dialogTitle: string) =>
                     Promise<{ success: false } | { success: true; filePath: string }>
    openFile:      (filePath: string) => Promise<void>

    setTheme:      (mode: import('./store/ui').ThemeMode) => Promise<void>

    zoom: {
      setFactor: (factor: number) => void
      getFactor: () => number
    }
  }
}
