import { app } from 'electron'
import { join } from 'path'

/**
 * Path of a bundled resource (fonts). Packaged: next to app.asar (electron-builder
 * extraResources); dev: out/main/ → ../../resources/.
 */
export function getResourcePath(...parts: string[]): string {
  return app.isPackaged ? join(process.resourcesPath, ...parts) : join(__dirname, '../../resources', ...parts)
}
