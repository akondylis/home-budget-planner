import { create } from 'zustand'
import { todayDateOnly } from '../../../shared/date-only'
import type { CategoryType, TransactionPage } from '../../../shared/ledger'

export const PAGE_SIZES = [50, 100, 200]

export interface LogFilter {
  /** 'yyyy-MM'; null = every month */
  month: string | null
  accountId: string | null
  categoryType: CategoryType | null
  categoryId: string | null
  uncategorised: boolean
  /** One import's rows, after the wizard */
  importBatchId: string | null
}

export const currentMonth = () => todayDateOnly().slice(0, 7)

export const EMPTY_FILTER = (): LogFilter => ({
  month: currentMonth(),
  accountId: null,
  categoryType: null,
  categoryId: null,
  uncategorised: false,
  importBatchId: null,
})

type TransactionsStore = {
  filter: LogFilter
  /** Zero-based, as `Pagination` counts */
  page: number
  pageSize: number
  data: TransactionPage | null
  loading: boolean
  /** Error code of the last failed load */
  error: unknown
  /** Ticked rows, for bulk actions */
  selected: string[]
  setFilter: (patch: Partial<LogFilter>) => void
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  toggleSelected: (id: string) => void
  setSelected: (ids: string[]) => void
  fetch: () => Promise<void>
}

// Answers can arrive out of order when filters change quickly; only the latest counts
let requestSeq = 0

export const useTransactionsStore = create<TransactionsStore>()((set, get) => ({
  filter: EMPTY_FILTER(),
  page: 0,
  pageSize: PAGE_SIZES[0],
  data: null,
  loading: false,
  error: null,
  selected: [],
  setFilter: patch => {
    set(s => ({ filter: { ...s.filter, ...patch }, page: 0, selected: [] }))
    void get().fetch()
  },
  setPage: page => {
    set({ page, selected: [] })
    void get().fetch()
  },
  setPageSize: pageSize => {
    set({ pageSize, page: 0, selected: [] })
    void get().fetch()
  },
  toggleSelected: id => set(s => ({
    selected: s.selected.includes(id) ? s.selected.filter(x => x !== id) : [...s.selected, id],
  })),
  setSelected: selected => set({ selected }),
  fetch: async () => {
    const seq = ++requestSeq
    const { filter, page, pageSize } = get()
    set({ loading: true })
    try {
      const data = await window.api.listTransactions({
        month: filter.month ?? undefined,
        accountId: filter.accountId ?? undefined,
        categoryType: filter.categoryType ?? undefined,
        categoryId: filter.categoryId ?? undefined,
        uncategorised: filter.uncategorised || undefined,
        importBatchId: filter.importBatchId ?? undefined,
        page: page + 1,
        pageSize,
      })
      if (seq !== requestSeq) return
      // Rows can disappear (delete, recategorise): keep only ticks that are still on the page
      set(s => ({ data, loading: false, error: null, selected: s.selected.filter(id => data.rows.some(r => r.id === id)) }))
    } catch (error) {
      if (seq === requestSeq) set({ loading: false, error })
    }
  },
}))
