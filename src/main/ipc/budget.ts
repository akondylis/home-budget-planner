import { ipcMain } from 'electron'
import { clearBudget, copyBudget, getBudgetMonth, setPlanned } from '../services/budgets'

export function registerBudgetHandlers(): void {
  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('budget:get', (_e, month: unknown) => getBudgetMonth(month))

  /** Throws: 'INVALID_INPUT', 'INVALID_AMOUNT', 'CATEGORY_NOT_FOUND' */
  ipcMain.handle('budget:setPlanned', (_e, month: unknown, categoryId: unknown, plannedCents: unknown) =>
    setPlanned(month, categoryId, plannedCents))

  /** Throws: 'INVALID_INPUT', 'BUDGET_SOURCE_EMPTY' */
  ipcMain.handle('budget:copy', (_e, input: unknown) => copyBudget(input))

  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('budget:clear', (_e, month: unknown) => clearBudget(month))
}
