import { create } from 'zustand'
import type { CommitResult } from '../../../shared/statement-import'

/** The import just made, for the banner on Transactions (with Undo) */
export interface LastImport extends CommitResult {
  accountId: string
}

type ImportStore = {
  /** Open wizard and the account it starts with; null = closed */
  wizard: { accountId: string | null } | null
  last: LastImport | null
  openWizard: (accountId?: string | null) => void
  closeWizard: () => void
  imported: (result: LastImport) => void
  clearLast: () => void
}

export const useImportStore = create<ImportStore>()(set => ({
  wizard: null,
  last: null,
  openWizard: (accountId = null) => set({ wizard: { accountId } }),
  closeWizard: () => set({ wizard: null }),
  imported: result => set({ wizard: null, last: result }),
  clearLast: () => set({ last: null }),
}))
