import { ipcMain } from 'electron'
import { archiveCategory, createCategory, listCategories, updateCategory } from '../services/categories'

export function registerCategoryHandlers(): void {
  ipcMain.handle('category:list', () => listCategories())

  /** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'CATEGORY_EXISTS' */
  ipcMain.handle('category:create', (_e, input: unknown) => createCategory(input))

  /** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'CATEGORY_EXISTS' */
  ipcMain.handle('category:update', (_e, id: unknown, input: unknown) => updateCategory(id, input))

  /** Throws: 'CATEGORY_NOT_FOUND' */
  ipcMain.handle('category:archive', (_e, id: unknown) => archiveCategory(id))
}
