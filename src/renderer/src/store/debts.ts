import { create } from 'zustand'
import type { DebtRow } from '../../../shared/debt'
import { useLedgerStore } from './ledger'

/** What the debt form opens with: a blank form or a debt to edit */
export type DebtFormRequest = { mode: 'create' } | { mode: 'edit'; debt: DebtRow }

type DebtsStore = {
  debts: DebtRow[]
  loaded: boolean
  /** Error of the last failed load */
  error: unknown
  load: () => Promise<void>
  /** The form is mounted by App, so Ctrl+K, the page and the bills page can all open it */
  form: DebtFormRequest | null
  openForm: (request?: DebtFormRequest) => void
  closeForm: () => void
  /** The debt whose detail is open (a bell row or a card opens it) */
  detailId: string | null
  openDetail: (id: string) => void
  closeDetail: () => void
  /** Reloads this page and everything that shows ledger data (bills, Overview, bell) */
  changed: () => Promise<void>
}

// Answers can arrive out of order; only the latest counts
let requestSeq = 0

export const useDebtsStore = create<DebtsStore>()((set, get) => ({
  debts: [],
  loaded: false,
  error: null,
  load: async () => {
    const seq = ++requestSeq
    try {
      const debts = await window.api.listDebts()
      if (seq === requestSeq) set({ debts, loaded: true, error: null })
    } catch (error) {
      if (seq === requestSeq) set({ loaded: true, error })
    }
  },
  form: null,
  openForm: (request = { mode: 'create' }) => set({ form: request }),
  closeForm: () => set({ form: null }),
  detailId: null,
  openDetail: id => set({ detailId: id }),
  closeDetail: () => set({ detailId: null }),
  changed: async () => {
    await useLedgerStore.getState().changed()
    await get().load()
  },
}))
