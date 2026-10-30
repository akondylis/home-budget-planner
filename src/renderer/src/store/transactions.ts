import { create } from 'zustand'
import { todayDateOnly } from '../../../shared/date-only'
import type { CategoryType, LogSort, LogSortKey, TransactionPage } from '../../../shared/ledger'

export const PAGE_SIZES = [50, 100, 200]

export interface LogFilter {
  /** 'yyyy-MM'; null = every month */
  month: string | null
  /** 'yyyy-MM-dd' days, both included (from Reports); never set together with `month` */
  range: { from: string; to: string } | null
  accountId: string | null
  categoryType: CategoryType | null
  categoryId: string | null
  uncategorised: boolean
  /** One import's rows, after the wizard */
  importBatchId: string | null
  /** A member id, or HOUSEHOLD for rows that are for no one parent */
  memberId: string | null
  /** Search text; '' = no search */
  query: string
}

export const currentMonth = () => todayDateOnly().slice(0, 7)

export const EMPTY_FILTER = (): LogFilter => ({
  month: currentMonth(),
  range: null,
  accountId: null,
  categoryType: null,
  categoryId: null,
  uncategorised: false,
  importBatchId: null,
  memberId: null,
  query: '',
})

export const DEFAULT_SORT: LogSort = { key: 'date', direction: 'desc' }

/** Where a column starts: newest date, biggest expense, A to Z */
const FIRST_DIRECTION: Record<LogSortKey, LogSort['direction']> = { date: 'desc', amount: 'asc', description: 'asc', category: 'asc' }

/** A new column starts at its natural direction; the sorted one flips */
export function nextSort(current: LogSort, key: LogSortKey): LogSort {
  if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  return { key, direction: FIRST_DIRECTION[key] }
}

type TransactionsStore = {
  filter: LogFilter
  /** Zero-based, as `Pagination` counts */
  page: number
  pageSize: number
  sort: LogSort
  data: TransactionPage | null
  loading: boolean
  /** Error code of the last failed load */
  error: unknown
  /** Bumped to put the cursor in the search box (Ctrl+F) */
  searchFocus: number
  /** Ticked rows, for bulk actions */
  selected: string[]
  setFilter: (patch: Partial<LogFilter>) => void
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  /** Sorts by a column, or flips the sorted one */
  setSort: (key: LogSortKey) => void
  focusSearch: () => void
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
  sort: DEFAULT_SORT,
  data: null,
  loading: false,
  error: null,
  searchFocus: 0,
  selected: [],
  setFilter: patch => {
    set(s => {
      const filter = { ...s.filter, ...patch }
      // A month and a range never both apply: the one just set wins
      if (patch.range) filter.month = null
      else if (patch.month) filter.range = null
      return { filter, page: 0, selected: [] }
    })
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
  setSort: key => {
    set(s => ({ sort: nextSort(s.sort, key), page: 0, selected: [] }))
    void get().fetch()
  },
  focusSearch: () => set(s => ({ searchFocus: s.searchFocus + 1 })),
  toggleSelected: id => set(s => ({
    selected: s.selected.includes(id) ? s.selected.filter(x => x !== id) : [...s.selected, id],
  })),
  setSelected: selected => set({ selected }),
  fetch: async () => {
    const seq = ++requestSeq
    const { filter, page, pageSize, sort } = get()
    set({ loading: true })
    try {
      const data = await window.api.listTransactions({
        month: filter.month ?? undefined,
        from: filter.range?.from,
        to: filter.range?.to,
        accountId: filter.accountId ?? undefined,
        categoryType: filter.categoryType ?? undefined,
        categoryId: filter.categoryId ?? undefined,
        uncategorised: filter.uncategorised || undefined,
        importBatchId: filter.importBatchId ?? undefined,
        memberId: filter.memberId ?? undefined,
        query: filter.query.trim() || undefined,
        sort: sort.key,
        direction: sort.direction,
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
