// The statement file the user chose. Main opens the dialog and keeps the path;
// the renderer only gets an id and the file name, so it can never ask main to
// read some other file.

import { randomUUID } from 'crypto'
import { readFile, stat } from 'fs/promises'
import { basename } from 'path'
import { dialog } from 'electron'
import type { PickedFile } from '../../../shared/statement-import'

/** Bank statements are a few hundred KB; anything far larger is not one */
const MAX_BYTES = 10 * 1024 * 1024
const MAX_PICKED = 10

const picked = new Map<string, string>()

/** Labels come from the renderer, in the app language. Returns null when the user cancels */
export async function pickStatementFile(labels: unknown): Promise<PickedFile | null> {
  const { title, filterName } = (labels ?? {}) as { title?: unknown; filterName?: unknown }
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: typeof title === 'string' ? title : undefined,
    properties: ['openFile'],
    filters: [{ name: typeof filterName === 'string' ? filterName : 'CSV', extensions: ['csv', 'txt', 'xlsx'] }],
  })
  if (canceled || filePaths.length === 0) return null
  while (picked.size >= MAX_PICKED) picked.delete(picked.keys().next().value!)
  const fileId = randomUUID()
  picked.set(fileId, filePaths[0])
  return { fileId, fileName: basename(filePaths[0]) }
}

/** Throws: 'IMPORT_FILE_UNREADABLE', 'IMPORT_FILE_TOO_LARGE' */
export async function readPickedFile(fileId: unknown): Promise<{ fileName: string; bytes: Uint8Array }> {
  const path = typeof fileId === 'string' ? picked.get(fileId) : undefined
  if (!path) throw new Error('IMPORT_FILE_UNREADABLE')
  try {
    if ((await stat(path)).size > MAX_BYTES) throw new Error('IMPORT_FILE_TOO_LARGE')
    return { fileName: basename(path), bytes: new Uint8Array(await readFile(path)) }
  } catch (err) {
    if (err instanceof Error && err.message === 'IMPORT_FILE_TOO_LARGE') throw err
    throw new Error('IMPORT_FILE_UNREADABLE')
  }
}
