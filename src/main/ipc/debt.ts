import { ipcMain } from 'electron'
import {
  createDebt,
  debtPaymentCandidates,
  getDebt,
  linkDebtPayment,
  listDebts,
  recordDebtCash,
  setDebtArchived,
  setDebtBalance,
  unlinkDebtPayment,
  updateDebt,
} from '../services/debts'

export function registerDebtHandlers(): void {
  ipcMain.handle('debt:list', () => listDebts())

  /** Throws: 'INVALID_INPUT', 'DEBT_NOT_FOUND' */
  ipcMain.handle('debt:get', (_e, id: unknown) => getDebt(id))

  /** Throws: 'INVALID_INPUT', 'INSTALMENT_TOO_LOW', 'CATEGORY_NOT_FOUND', 'ACCOUNT_NOT_FOUND', 'MEMBER_NOT_FOUND', 'INSTITUTION_NOT_FOUND' */
  ipcMain.handle('debt:create', (_e, input: unknown) => createDebt(input))

  /** Throws: as debt:create, plus 'DEBT_NOT_FOUND' */
  ipcMain.handle('debt:update', (_e, id: unknown, input: unknown) => updateDebt(id, input))

  /** Throws: 'INVALID_INPUT', 'DEBT_NOT_FOUND' */
  ipcMain.handle('debt:setBalance', (_e, input: unknown) => setDebtBalance(input))

  /** Throws: 'INVALID_INPUT', 'DEBT_NOT_FOUND' */
  ipcMain.handle('debt:setArchived', (_e, id: unknown, archived: unknown) => setDebtArchived(id, archived))

  /** Throws: 'INVALID_INPUT', 'DEBT_NOT_FOUND' */
  ipcMain.handle('debt:paymentCandidates', (_e, id: unknown) => debtPaymentCandidates(id))

  /** Throws: 'INVALID_INPUT', 'DEBT_NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'PAYMENT_ALREADY_LINKED', 'TRANSACTION_ALREADY_LINKED' */
  ipcMain.handle('debt:linkPayment', (_e, input: unknown) => linkDebtPayment(input))

  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('debt:unlinkPayment', (_e, transactionId: unknown) => unlinkDebtPayment(transactionId))

  /** Throws: as transaction:create, plus 'DEBT_NOT_FOUND' */
  ipcMain.handle('debt:recordCash', (_e, input: unknown) => recordDebtCash(input))
}
