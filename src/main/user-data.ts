import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'

/** A file with this name next to the exe turns on the portable (USB) edition */
export const PORTABLE_MARKER = 'portable'
/** Portable data folder, next to the exe */
export const PORTABLE_DATA_DIR = 'HomeBudget-data'

let portable: boolean | null = null

/** Folder of the exe when the portable marker sits next to it (packaged builds only) */
export function portableRoot(): string | null {
  if (!app.isPackaged) return null
  const root = dirname(process.execPath)
  return existsSync(join(root, PORTABLE_MARKER)) ? root : null
}

/** True for the portable edition; the result is cached for the process */
export function isPortable(): boolean {
  if (portable === null) portable = portableRoot() !== null
  return portable
}

/** Test hook: forget the cached portable flag */
export function resetPortableCache(): void {
  portable = null
}

/**
 * Portable edition: moves userData next to the exe so the data travels with the stick.
 * Installed builds keep Electron's default (%APPDATA%/<app name>). An explicit
 * --user-data-dir wins.
 */
export function pinUserDataPath(): void {
  if (!app.isPackaged || app.commandLine.hasSwitch('user-data-dir')) return
  const root = portableRoot()
  portable = root !== null
  // Electron ignores --disk-cache-dir, so Chromium's caches stay here too; they are
  // small (~1 MB) because the UI loads from file://.
  if (root) app.setPath('userData', join(root, PORTABLE_DATA_DIR))
}

/**
 * Portable edition: the data folder must be writable (a locked or read-only stick
 * is not). There is no silent fallback to AppData; the caller shows an error.
 */
export function isDataDirWritable(dir: string): boolean {
  const probe = join(dir, '.write-test')
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(probe, '')
    rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}
