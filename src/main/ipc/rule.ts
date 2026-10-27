import { ipcMain } from 'electron'
import { createRule, deleteRule, listRules, updateRule } from '../services/rules'

export function registerRuleHandlers(): void {
  ipcMain.handle('rule:list', () => listRules())

  /** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'ACCOUNT_NOT_FOUND' */
  ipcMain.handle('rule:create', (_e, input: unknown) => createRule(input))

  /** Throws: 'INVALID_INPUT', 'RULE_NOT_FOUND', 'CATEGORY_NOT_FOUND' */
  ipcMain.handle('rule:update', (_e, id: unknown, input: unknown) => updateRule(id, input))

  /** Throws: 'INVALID_INPUT', 'RULE_NOT_FOUND' */
  ipcMain.handle('rule:delete', (_e, id: unknown) => deleteRule(id))
}
