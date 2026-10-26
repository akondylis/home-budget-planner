import type { TFunction } from 'i18next'

/**
 * Extracts the short error code from an Electron IPC rejection message.
 * Electron wraps errors as: "Error invoking remote method 'x': Error: CODE"
 */
export function ipcErrorCode(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const m = msg.match(/Error:\s([A-Z_]+)\s*$/)
  return m ? m[1] : msg
}

/** The translated message for an IPC rejection: `error.<CODE>`, or a generic one for unknown codes */
export function ipcErrorMessage(err: unknown, t: TFunction): string {
  const code = ipcErrorCode(err)
  return t(`error.${code}`, { defaultValue: t('error.UNKNOWN') })
}
