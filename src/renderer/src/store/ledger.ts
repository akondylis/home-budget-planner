import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { safeStorage, useUiStore } from './ui'
import type { AccountSummary, CategoryNode, PayeeSuggestion, TransactionRow } from '../../../shared/ledger'
import type { FormKind } from '../lib/ledger'
import { resolveCurrentMember } from '../lib/members'
import type { MemberSummary } from '../../../shared/members'

/** What the entry form opens for */
export type EntryRequest =
  | { mode: 'create'; kind?: FormKind; accountId?: string }
  | { mode: 'edit'; row: TransactionRow }

type LedgerStore = {
  /** Every account, archived ones included (screens filter) */
  accounts: AccountSummary[]
  categories: CategoryNode[]
  /** Every member, archived ones included (pickers filter) */
  members: MemberSummary[]
  payees: PayeeSuggestion[]
  loaded: boolean
  /** Bumped after every write, so open lists reload */
  revision: number
  /** Account of the last saved entry: the next one starts there */
  lastAccountId: string | null
  entry: EntryRequest | null
  /** Row id or transferId of the entry just saved, highlighted in the log */
  highlightKey: string | null
  /** Merchants (payee keys) the user said are not subscriptions */
  dismissedHints: string[]
  load: () => Promise<void>
  /** Call after a write: reloads balances and suggestions and tells lists to refresh */
  changed: () => Promise<void>
  openEntry: (request?: EntryRequest) => void
  closeEntry: () => void
  saved: (key: string, accountId: string) => void
  dismissHint: (key: string) => void
}

async function fetchAll() {
  const [accounts, categories, members, payees] = await Promise.all([
    window.api.listAccounts({ includeArchived: true }),
    window.api.listCategories(),
    window.api.listMembers({ includeArchived: true }),
    window.api.listPayees(),
  ])
  // An archived or deleted member stops being the one using the app; a lone parent becomes it
  const ui = useUiStore.getState()
  const current = resolveCurrentMember(members, ui.currentMemberId)
  if (current !== ui.currentMemberId) ui.setCurrentMember(current)
  return { accounts, categories, members, payees }
}

export const useLedgerStore = create<LedgerStore>()(
  persist(
    set => ({
      accounts: [],
      categories: [],
      members: [],
      payees: [],
      loaded: false,
      revision: 0,
      lastAccountId: null,
      entry: null,
      highlightKey: null,
      dismissedHints: [],
      load: async () => {
        set({ ...(await fetchAll()), loaded: true })
      },
      changed: async () => {
        const data = await fetchAll()
        set(s => ({ ...data, loaded: true, revision: s.revision + 1 }))
      },
      openEntry: (request = { mode: 'create' }) => set({ entry: request }),
      closeEntry: () => set({ entry: null }),
      saved: (key, accountId) => set({ highlightKey: key, lastAccountId: accountId }),
      dismissHint: key => set(s => ({ dismissedHints: [...new Set([...s.dismissedHints, key])] })),
    }),
    {
      name: 'ledger-prefs',
      storage: createJSONStorage(() => safeStorage),
      partialize: s => ({ lastAccountId: s.lastAccountId, dismissedHints: s.dismissedHints }),
    },
  ),
)

/** Active accounts, in their saved order */
export const activeAccounts = (accounts: AccountSummary[]) => accounts.filter(a => !a.archived)
