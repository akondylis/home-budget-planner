import { create } from 'zustand'
import { addMonths } from '../../../shared/date-only'
import type { BudgetMonth, CopySource } from '../../../shared/budget'
import { currentMonth } from './transactions'
import { withPlanned } from '../lib/budget'

/** Outcome of a write started outside the page (Ctrl+K), shown once by the page */
export type BudgetFlash = { kind: 'copied'; count: number } | { kind: 'error'; error: unknown }

type BudgetStore = {
  /** 'yyyy-MM' shown on the Budget page */
  month: string
  data: BudgetMonth | null
  loading: boolean
  /** Error of the last failed load */
  error: unknown
  setMonth: (month: string) => void
  /** Moves the page by `delta` months */
  shift: (delta: number) => void
  load: () => Promise<void>
  /** Saves one planned amount; the page updates at once and rolls back if the save fails (rethrows) */
  setPlanned: (categoryId: string, plannedCents: number) => Promise<void>
  /** Fills this month's empty lines from last month; returns how many were written */
  copyFromPrevious: (source: CopySource) => Promise<number>
  clear: () => Promise<void>
  setCarryOver: (categoryId: string, carryOver: boolean) => Promise<void>
  flash: BudgetFlash | null
  setFlash: (flash: BudgetFlash | null) => void
}

// Answers can arrive out of order when months change quickly; only the latest counts
let requestSeq = 0

export const useBudgetStore = create<BudgetStore>()((set, get) => ({
  month: currentMonth(),
  data: null,
  loading: false,
  error: null,
  setMonth: month => {
    if (month === get().month) return
    set({ month })
    void get().load()
  },
  shift: delta => get().setMonth(addMonths(get().month, delta)),
  load: async () => {
    const seq = ++requestSeq
    const { month } = get()
    set({ loading: true })
    try {
      const data = await window.api.getBudget(month)
      if (seq === requestSeq) set({ data, loading: false, error: null })
    } catch (error) {
      if (seq === requestSeq) set({ loading: false, error })
    }
  },
  setPlanned: async (categoryId, plannedCents) => {
    const { month, data } = get()
    if (data?.month === month) set({ data: withPlanned(data, categoryId, plannedCents) })
    try {
      await window.api.setPlanned(month, categoryId, plannedCents)
    } finally {
      // Success refreshes carry and the plan's time; failure brings back the saved amount
      await get().load()
    }
  },
  copyFromPrevious: async source => {
    const { month } = get()
    const written = await window.api.copyBudget({ from: addMonths(month, -1), to: month, source })
    await get().load()
    return written
  },
  clear: async () => {
    await window.api.clearBudget(get().month)
    await get().load()
  },
  setCarryOver: async (categoryId, carryOver) => {
    await window.api.setCarryOver(categoryId, carryOver)
    await get().load()
  },
  flash: null,
  setFlash: flash => set({ flash }),
}))
