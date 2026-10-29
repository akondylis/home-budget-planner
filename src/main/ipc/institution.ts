import { ipcMain } from 'electron'
import { archiveInstitution, createInstitution, listInstitutions, moveInstitution, updateInstitution } from '../services/institutions'

export function registerInstitutionHandlers(): void {
  ipcMain.handle('institution:list', (_e, opts?: { includeArchived?: boolean }) => listInstitutions(opts))

  /** Throws: 'INVALID_INPUT', 'INSTITUTION_NAME_TAKEN' */
  ipcMain.handle('institution:create', (_e, input: unknown) => createInstitution(input))

  /** Throws: 'INVALID_INPUT', 'INSTITUTION_NOT_FOUND', 'INSTITUTION_NAME_TAKEN', 'INSTITUTION_IN_USE' */
  ipcMain.handle('institution:update', (_e, id: unknown, input: unknown) => updateInstitution(id, input))

  /** Throws: 'INSTITUTION_NOT_FOUND' */
  ipcMain.handle('institution:archive', (_e, id: unknown, archived?: boolean) => archiveInstitution(id, archived !== false))

  /** Throws: 'INVALID_INPUT', 'INSTITUTION_NOT_FOUND' */
  ipcMain.handle('institution:move', (_e, id: unknown, direction: unknown) => moveInstitution(id, direction))
}
