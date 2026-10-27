import { ipcMain } from 'electron'
import { pickStatementFile, readPickedFile } from '../services/import/picked-files'
import { commitImport, listImports, previewImport, undoImport } from '../services/import/import-service'

export function registerImportHandlers(): void {
  ipcMain.handle('import:pickFile', (_e, labels: unknown) => pickStatementFile(labels))

  /** Throws: 'INVALID_INPUT', 'ACCOUNT_NOT_FOUND', 'IMPORT_FILE_UNREADABLE', 'IMPORT_FILE_TOO_LARGE' */
  ipcMain.handle('import:preview', async (_e, accountId: unknown, fileId: unknown, mapping: unknown) => {
    const { fileName, bytes } = await readPickedFile(fileId)
    return previewImport(accountId, fileName, bytes, mapping)
  })

  /** Throws: 'INVALID_INPUT', 'IMPORT_PREVIEW_EXPIRED', 'IMPORT_NOTHING_TO_IMPORT', 'SAME_ACCOUNT', 'ACCOUNT_NOT_FOUND' */
  ipcMain.handle('import:commit', (_e, input: unknown) => commitImport(input))

  ipcMain.handle('import:history', (_e, accountId: unknown) => listImports(accountId))

  /** Throws: 'INVALID_INPUT', 'IMPORT_NOT_FOUND', 'IMPORT_ALREADY_UNDONE' */
  ipcMain.handle('import:undo', (_e, batchId: unknown) => undoImport(batchId))
}
