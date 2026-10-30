import { create } from 'zustand'
import { addMonths } from '../../../shared/date-only'
import type { BudgetMonth, BudgetYear, CopySource, FillYearInput } from '../../../shared/budget'
import { currentMonth } from './transactions'
import { withPlanned, withYearPlanned } from '../lib/budget'

export type BudgetView = 'month' | 'year'

/** A fill without its year: the store adds the year on screen */
export type YearFill = FillYearInput extends infer F ? (F extends unknown ? Omit<F, 'year'> : never) : never

/** Outcome of a write started outside the page (Ctrl+K), shown once by the page */
export type BudgetFlash = { kind: 'copied'; count: number } | { kind: 'error'; error: unknown }

type BudgetStore = {
  /** Month or Year view of the Budget page */
  view: BudgetView
  setView: (view: BudgetView) => void
  year: number
  yearData: BudgetYear | null
  setYear: (year: number) => void
  shiftYear: (delta: number) => void
  loadYear: () => Promise<void>
  /** Loads whichever view is showing */
  reload: () => Promise<void>
  /** Saves one month's plan from the year grid, at once on screen (rolls back and rethrows on failure) */
  setYearPlanned: (monthIndex: number, categoryId: string, plannedCents: number) => Promise<void>
  /** Fills the empty months of the year; returns how many lines were written */
  fillYear: (fill: YearFill) => Promise<number>
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
let yearSeq = 0

export const useBudgetStore = create<BudgetStore>()((set, get) => ({
  view: 'month',
  setView: view => {
    if (view === get().view) return
    set({ view })
    void get().reload()
  },
  year: new Date().getFullYear(),
  yearData: null,
  setYear: year => {
    if (year === get().year) return
    set({ year })
    void get().loadYear()
  },
  shiftYear: delta => get().setYear(get().year + delta),
  loadYear: async () => {
    const seq = ++yearSeq
    const { year } = get()
    set({ loading: true })
    try {
      const yearData = await window.api.getBudgetYear(year)
      if (seq === yearSeq) set({ yearData, loading: false, error: null })
    } catch (error) {
      if (seq === yearSeq) set({ loading: false, error })
    }
  },
  reload: () => (get().view === 'year' ? get().loadYear() : get().load()),
  setYearPlanned: async (monthIndex, categoryId, plannedCents) => {
    const { year, yearData } = get()
    if (yearData?.year === year) set({ yearData: withYearPlanned(yearData, monthIndex, categoryId, plannedCents) })
    try {
      await window.api.setPlanned(`${year}-${String(monthIndex + 1).padStart(2, '0')}`, categoryId, plannedCents)
    } finally {
      await get().loadYear()
    }
  },
  fillYear: async fill => {
    const written = await window.api.fillBudgetYear({ ...fill, year: get().year } as FillYearInput)
    await get().loadYear()
    return written
  },
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
