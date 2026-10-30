import { create } from 'zustand'
import { todayDateOnly } from '../../../shared/date-only'
import type { RecurringRuleRow, UpcomingBill } from '../../../shared/recurrence'
import type { SubscriptionHint } from '../../../shared/statement-import'
import { pageRange } from '../lib/recurring'
import { useLedgerStore } from './ledger'

/** What the bill form opens with: a blank form, a hint to track, or a rule to edit */
export type RuleFormRequest =
  | { mode: 'create' }
  | { mode: 'hint'; hint: SubscriptionHint }
  | { mode: 'edit'; rule: RecurringRuleRow }

type RecurringStore = {
  rules: RecurringRuleRow[]
  /** Due dates of the page's range (see pageRange) */
  bills: UpcomingBill[]
  loaded: boolean
  /** Error of the last failed load */
  error: unknown
  load: () => Promise<void>
  /** The form is mounted by App, so Ctrl+K, a hint and the page can all open it */
  form: RuleFormRequest | null
  openForm: (request?: RuleFormRequest) => void
  closeForm: () => void
  /** Reloads this page and everything that shows ledger data (Overview card, budget suggestions) */
  changed: () => Promise<void>
}

// Answers can arrive out of order; only the latest counts
let requestSeq = 0

export const useRecurringStore = create<RecurringStore>()((set, get) => ({
  rules: [],
  bills: [],
  loaded: false,
  error: null,
  load: async () => {
    const seq = ++requestSeq
    try {
      const [rules, bills] = await Promise.all([window.api.listBills(), window.api.billOccurrences(pageRange(todayDateOnly()))])
      if (seq === requestSeq) set({ rules, bills, loaded: true, error: null })
    } catch (error) {
      if (seq === requestSeq) set({ loaded: true, error })
    }
  },
  form: null,
  openForm: (request = { mode: 'create' }) => set({ form: request }),
  closeForm: () => set({ form: null }),
  changed: async () => {
    // The ledger revision makes every page (this one included) reload
    await useLedgerStore.getState().changed()
    await get().load()
  },
}))
