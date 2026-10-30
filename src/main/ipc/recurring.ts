import { ipcMain } from 'electron'
import {
  countMatches,
  createRule,
  listOccurrences,
  listRules,
  markPaid,
  payInCash,
  paymentCandidates,
  setRuleArchived,
  skipOccurrence,
  unmarkOccurrence,
  updateRule,
} from '../services/recurring'

export function registerRecurringHandlers(): void {
  ipcMain.handle('recurring:list', () => listRules())

  /** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'ACCOUNT_NOT_FOUND', 'MEMBER_NOT_FOUND' */
  ipcMain.handle('recurring:create', (_e, input: unknown) => createRule(input))

  /** Throws: as recurring:create, plus 'RULE_NOT_FOUND', 'DEBT_OWNED_RULE' */
  ipcMain.handle('recurring:update', (_e, id: unknown, input: unknown) => updateRule(id, input))

  /** Throws: 'INVALID_INPUT', 'RULE_NOT_FOUND', 'DEBT_OWNED_RULE' */
  ipcMain.handle('recurring:setArchived', (_e, id: unknown, archived: unknown) => setRuleArchived(id, archived))

  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('recurring:occurrences', (_e, range: unknown) => listOccurrences(range))

  /** Throws: 'INVALID_INPUT', 'RULE_NOT_FOUND', 'INVALID_DATE' */
  ipcMain.handle('recurring:candidates', (_e, input: unknown) => paymentCandidates(input))

  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('recurring:countMatches', (_e, input: unknown) => countMatches(input))

  /** Throws: 'INVALID_INPUT', 'RULE_NOT_FOUND', 'INVALID_DATE', 'TRANSACTION_NOT_FOUND', 'TRANSACTION_ALREADY_LINKED' */
  ipcMain.handle('recurring:markPaid', (_e, input: unknown) => markPaid(input))

  /** Throws: as transaction:create, plus 'RULE_NOT_FOUND', 'INVALID_DATE' */
  ipcMain.handle('recurring:payInCash', (_e, input: unknown) => payInCash(input))

  /** Throws: 'INVALID_INPUT', 'RULE_NOT_FOUND', 'INVALID_DATE' */
  ipcMain.handle('recurring:skip', (_e, input: unknown) => skipOccurrence(input))

  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('recurring:unmark', (_e, input: unknown) => unmarkOccurrence(input))
}
