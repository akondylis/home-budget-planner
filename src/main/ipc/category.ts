import { ipcMain } from 'electron'
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  listCategories,
  listCategoriesForManage,
  mergeCategory,
  moveCategory,
  reorderCategories,
  setCarryOver,
  updateCategory,
} from '../services/categories'

export function registerCategoryHandlers(): void {
  ipcMain.handle('category:list', () => listCategories())

  ipcMain.handle('category:manage', () => listCategoriesForManage())

  /** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'CATEGORY_EXISTS' */
  ipcMain.handle('category:create', (_e, input: unknown) => createCategory(input))

  /** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'CATEGORY_EXISTS' */
  ipcMain.handle('category:update', (_e, id: unknown, input: unknown) => updateCategory(id, input))

  /** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'CATEGORY_EXISTS' */
  ipcMain.handle('category:archive', (_e, id: unknown, archived: unknown) => archiveCategory(id, archived))

  /** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'CATEGORY_EXISTS' */
  ipcMain.handle('category:move', (_e, id: unknown, parentId: unknown) => moveCategory(id, parentId))

  /** Throws: 'INVALID_INPUT' */
  ipcMain.handle('category:reorder', (_e, parentId: unknown, orderedIds: unknown) => reorderCategories(parentId, orderedIds))

  /** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND' */
  ipcMain.handle('category:merge', (_e, sourceId: unknown, targetId: unknown) => mergeCategory(sourceId, targetId))

  /** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'CATEGORY_IN_USE' */
  ipcMain.handle('category:delete', (_e, id: unknown) => deleteCategory(id))

  /** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND' */
  ipcMain.handle('category:setCarryOver', (_e, id: unknown, carryOver: unknown) => setCarryOver(id, carryOver))
}
