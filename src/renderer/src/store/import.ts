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
  /** Open import history, for one account or all (null) */
  history: { accountId: string | null } | null
  openWizard: (accountId?: string | null) => void
  closeWizard: () => void
  imported: (result: LastImport) => void
  clearLast: () => void
  openHistory: (accountId?: string | null) => void
  closeHistory: () => void
}

export const useImportStore = create<ImportStore>()(set => ({
  wizard: null,
  last: null,
  history: null,
  openWizard: (accountId = null) => set({ wizard: { accountId }, history: null }),
  closeWizard: () => set({ wizard: null }),
  imported: result => set({ wizard: null, last: result }),
  clearLast: () => set({ last: null }),
  // The wizard steps aside: history is where an import is undone, not added
  openHistory: (accountId = null) => set({ wizard: null, history: { accountId } }),
  closeHistory: () => set({ history: null }),
}))
