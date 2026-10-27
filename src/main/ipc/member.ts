import { ipcMain } from 'electron'
import { archiveMember, createMember, listMembers, updateMember } from '../services/members'

export function registerMemberHandlers(): void {
  ipcMain.handle('member:list', (_e, opts?: { includeArchived?: boolean }) => listMembers(opts))

  /** Throws: 'INVALID_INPUT', 'MEMBER_NAME_TAKEN' */
  ipcMain.handle('member:create', (_e, input: unknown) => createMember(input))

  /** Throws: 'INVALID_INPUT', 'MEMBER_NOT_FOUND', 'MEMBER_NAME_TAKEN' */
  ipcMain.handle('member:update', (_e, id: unknown, input: unknown) => updateMember(id, input))

  /** Throws: 'MEMBER_NOT_FOUND', 'MEMBER_NAME_TAKEN' (restoring) */
  ipcMain.handle('member:archive', (_e, id: unknown, archived?: boolean) => archiveMember(id, archived !== false))
}
