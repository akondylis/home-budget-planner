import { ipcMain } from 'electron'
import { archiveAccount, createAccount, createAccounts, listAccounts, updateAccount } from '../services/accounts'

export function registerAccountHandlers(): void {
  ipcMain.handle('account:list', (_e, opts?: { includeArchived?: boolean }) => listAccounts(opts))

  /** Throws: 'INVALID_INPUT', 'MEMBER_NOT_FOUND', 'CARD_DUPLICATE' */
  ipcMain.handle('account:create', (_e, input: unknown) => createAccount(input))

  /** Quick setup: several accounts in one write. Throws: 'INVALID_INPUT' */
  ipcMain.handle('account:createMany', (_e, inputs: unknown) => createAccounts(inputs))

  /** Throws: 'INVALID_INPUT', 'ACCOUNT_NOT_FOUND', 'MEMBER_NOT_FOUND', 'CARD_DUPLICATE', 'CARD_NOT_FOUND' */
  ipcMain.handle('account:update', (_e, id: unknown, input: unknown) => updateAccount(id, input))

  /** Throws: 'ACCOUNT_NOT_FOUND' */
  ipcMain.handle('account:archive', (_e, id: unknown, archived?: boolean) => archiveAccount(id, archived !== false))
}
