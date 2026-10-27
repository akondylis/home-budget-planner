// Pure helpers for the accounts and transactions screens: picker options, form
// defaults and validation. Kept out of components so they can be unit-tested.

import type { IconName } from '../components/shell/icons'
import { parseMoney } from '../../../shared/money'
import { isDateOnly } from '../../../shared/date-only'
import type {
  AccountInput,
  AccountKind,
  AccountSummary,
  CategoryNode,
  CategoryType,
  Institution,
  TransactionRow,
} from '../../../shared/ledger'

export type FormKind = 'EXPENSE' | 'INCOME' | 'TRANSFER'

export const ACCOUNT_KIND_ICON: Record<AccountKind, IconName> = {
  CURRENT: 'bank',
  SAVINGS: 'target',
  CASH: 'wallet',
  CREDIT_CARD: 'credit-card',
}

/** Accounts offered by Quick setup: both banks' account and card, plus cash. Names: `accounts.quick.<key>` */
export const QUICK_SETUP: { key: string; kind: AccountKind; institution: Institution }[] = [
  { key: 'alpha_account', kind: 'CURRENT', institution: 'ALPHA' },
  { key: 'alpha_card', kind: 'CREDIT_CARD', institution: 'ALPHA' },
  { key: 'eurobank_account', kind: 'CURRENT', institution: 'EUROBANK' },
  { key: 'eurobank_card', kind: 'CREDIT_CARD', institution: 'EUROBANK' },
  { key: 'cash', kind: 'CASH', institution: 'OTHER' },
]

// ── Categories ───────────────────────────────────────────────────────────────

/** What a category picker offers: EXPENSE = every type but income; a category type = only that type */
export type PickerKind = 'EXPENSE' | 'ANY' | CategoryType

/** Groups a picker offers: income only for income, everything but income for an expense */
export function groupsFor(tree: CategoryNode[], kind: PickerKind): CategoryNode[] {
  const fits = (type: CategoryType) => kind === 'ANY' || (kind === 'EXPENSE' ? type !== 'INCOME' : type === kind)
  return tree.filter(g => fits(g.type) && g.children.length > 0)
}

export function findCategory(tree: CategoryNode[], id: string | null | undefined): CategoryNode | null {
  if (!id) return null
  for (const group of tree) {
    if (group.id === id) return group
    const child = group.children.find(c => c.id === id)
    if (child) return child
  }
  return null
}

// ── Entry form ───────────────────────────────────────────────────────────────

export interface EntryDraft {
  kind: FormKind
  amount: string
  accountId: string
  toAccountId: string
  categoryId: string | null
  payee: string
  note: string
  bookedAt: string
}

export type EntryField = 'amount' | 'accountId' | 'toAccountId' | 'categoryId' | 'bookedAt'
/** i18n keys under `entry.errors` */
export type EntryErrors = Partial<Record<EntryField, string>>

/** The account a new entry starts in: the one asked for, else the last used, else the first */
export function defaultAccountId(
  accounts: AccountSummary[],
  requested?: string | null,
  lastUsed?: string | null,
): string {
  const active = accounts.filter(a => !a.archived)
  const pick = [requested, lastUsed].find(id => id && active.some(a => a.id === id))
  return pick ?? active[0]?.id ?? ''
}

/** For a transfer: Cash when it is not the source (ATM withdrawals), else the first other account */
export function defaultToAccountId(accounts: AccountSummary[], fromId: string): string {
  const others = accounts.filter(a => !a.archived && a.id !== fromId)
  return (others.find(a => a.kind === 'CASH') ?? others[0])?.id ?? ''
}

/** Cents as an editable amount without sign or grouping, e.g. 123450 → "1234,50" */
export function centsToInput(cents: number): string {
  const abs = Math.abs(cents)
  return `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

/** Form values of an existing row (amount without sign); a transfer always reads from → to */
export function draftFromRow(row: TransactionRow): EntryDraft {
  const transfer = row.transferId !== null
  const outgoing = row.amountCents < 0
  const otherId = row.transferAccountId ?? ''
  return {
    kind: transfer ? 'TRANSFER' : outgoing ? 'EXPENSE' : 'INCOME',
    amount: centsToInput(row.amountCents),
    accountId: transfer && !outgoing ? otherId : row.accountId,
    toAccountId: transfer ? (outgoing ? otherId : row.accountId) : '',
    categoryId: row.categoryId,
    payee: row.payee ?? '',
    note: row.note ?? '',
    bookedAt: row.bookedAt,
  }
}

/** Errors by field; empty when the draft can be saved */
export function validateEntry(draft: EntryDraft): EntryErrors {
  const errors: EntryErrors = {}
  const cents = parseMoney(draft.amount)
  if (draft.amount.trim() === '') errors.amount = 'amount_required'
  else if (cents === null || cents <= 0) errors.amount = 'amount_invalid'
  if (!draft.accountId) errors.accountId = 'account_required'
  if (!isDateOnly(draft.bookedAt)) errors.bookedAt = 'date_required'
  if (draft.kind === 'TRANSFER') {
    if (!draft.toAccountId) errors.toAccountId = 'account_required'
    else if (draft.toAccountId === draft.accountId) errors.toAccountId = 'same_account'
  } else if (!draft.categoryId) {
    errors.categoryId = 'category_required'
  }
  return errors
}

// ── Account form ─────────────────────────────────────────────────────────────

export interface AccountDraft {
  name: string
  kind: AccountKind
  institution: Institution
  openingBalance: string
  openingDate: string
}

/** The input to save, or the i18n keys (under `accounts.errors`) of what is wrong */
export function parseAccountDraft(draft: AccountDraft): { input: AccountInput } | { errors: Partial<Record<'name' | 'openingBalance' | 'openingDate', string>> } {
  const errors: Partial<Record<'name' | 'openingBalance' | 'openingDate', string>> = {}
  const cents = draft.openingBalance.trim() === '' ? 0 : parseMoney(draft.openingBalance)
  if (!draft.name.trim()) errors.name = 'name_required'
  if (cents === null) errors.openingBalance = 'amount_invalid'
  if (!isDateOnly(draft.openingDate)) errors.openingDate = 'date_required'
  if (Object.keys(errors).length > 0 || cents === null) return { errors }
  return {
    input: {
      name: draft.name.trim(),
      kind: draft.kind,
      institution: draft.institution,
      openingBalanceCents: cents,
      openingDate: draft.openingDate,
    },
  }
}
