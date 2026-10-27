import { ipcMain } from 'electron'
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  linkTransfer,
  listPayeeSuggestions,
  listTransactions,
  setCategory,
  setMember,
  updateTransaction,
  updateTransfer,
} from '../services/transactions'

export function registerTransactionHandlers(): void {
  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('transaction:list', (_e, filter: unknown) => listTransactions(filter))

  ipcMain.handle('transaction:payees', () => listPayeeSuggestions())

  /** Throws: 'INVALID_INPUT', 'INVALID_AMOUNT', 'ACCOUNT_NOT_FOUND', 'CATEGORY_REQUIRED', 'CATEGORY_NOT_FOUND', 'MEMBER_NOT_FOUND' */
  ipcMain.handle('transaction:create', (_e, input: unknown) => createTransaction(input))

  /** Throws: as create, plus 'TRANSACTION_NOT_FOUND', 'TRANSACTION_IS_TRANSFER' */
  ipcMain.handle('transaction:update', (_e, id: unknown, input: unknown) => updateTransaction(id, input))

  /** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND' */
  ipcMain.handle('transaction:setCategory', (_e, ids: unknown, categoryId: unknown) => setCategory(ids, categoryId))

  /** Throws: 'INVALID_INPUT', 'MEMBER_NOT_FOUND' */
  ipcMain.handle('transaction:setMember', (_e, ids: unknown, memberId: unknown) => setMember(ids, memberId))

  /** Throws: 'INVALID_INPUT', 'INVALID_AMOUNT', 'SAME_ACCOUNT', 'ACCOUNT_NOT_FOUND', 'MEMBER_NOT_FOUND' */
  ipcMain.handle('transaction:createTransfer', (_e, input: unknown) => createTransfer(input))

  /** Throws: as createTransfer, plus 'TRANSACTION_NOT_FOUND', 'TRANSFER_IMPORTED' */
  ipcMain.handle('transaction:updateTransfer', (_e, transferId: unknown, input: unknown) => updateTransfer(transferId, input))

  /** Throws: 'TRANSACTION_NOT_FOUND', 'TRANSFER_MISMATCH' */
  ipcMain.handle('transaction:linkTransfer', (_e, idA: unknown, idB: unknown) => linkTransfer(idA, idB))

  /** Throws: 'TRANSACTION_NOT_FOUND' */
  ipcMain.handle('transaction:delete', (_e, id: unknown) => deleteTransaction(id))
}
