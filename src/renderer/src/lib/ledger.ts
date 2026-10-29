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
  TransactionRow,
} from '../../../shared/ledger'

export type FormKind = 'EXPENSE' | 'INCOME' | 'TRANSFER'

export const ACCOUNT_KIND_ICON: Record<AccountKind, IconName> = {
  CURRENT: 'bank',
  SAVINGS: 'target',
  CASH: 'wallet',
  CREDIT_CARD: 'credit-card',
  MEAL_VOUCHER: 'utensils',
}

/** Kinds with a bank statement to import: not cash, not a meal-voucher card (entered by hand) */
export function isImportable(kind: AccountKind): boolean {
  return kind !== 'CASH' && kind !== 'MEAL_VOUCHER'
}

/** Money can move out of it: a meal-voucher card is never the source of a transfer */
export function canSendTransfer(kind: AccountKind): boolean {
  return kind !== 'MEAL_VOUCHER'
}

/**
 * Accounts offered by Quick setup: both banks' account and card, plus cash. Names: `accounts.quick.<key>`.
 * Banks by their starter-list id (migration 20261029120000_institutions_table); null = no bank.
 */
export const QUICK_SETUP: { key: string; kind: AccountKind; institutionId: string | null }[] = [
  { key: 'alpha_account', kind: 'CURRENT', institutionId: 'inst_alpha' },
  { key: 'alpha_card', kind: 'CREDIT_CARD', institutionId: 'inst_alpha' },
  { key: 'eurobank_account', kind: 'CURRENT', institutionId: 'inst_eurobank' },
  { key: 'eurobank_card', kind: 'CREDIT_CARD', institutionId: 'inst_eurobank' },
  { key: 'cash', kind: 'CASH', institutionId: null },
]

// ── Categories ───────────────────────────────────────────────────────────────

/** What a category picker offers: EXPENSE = every type but income; a category type = only that type */
export type PickerKind = 'EXPENSE' | 'ANY' | CategoryType

/** Whether a group of this type suits the picker: income only for income, everything but income for an expense */
export function fitsKind(type: CategoryType, kind: PickerKind): boolean {
  return kind === 'ANY' || (kind === 'EXPENSE' ? type !== 'INCOME' : type === kind)
}

/** Groups a picker offers (those with categories in them) */
export function groupsFor(tree: CategoryNode[], kind: PickerKind): CategoryNode[] {
  return tree.filter(g => fitsKind(g.type, kind) && g.children.length > 0)
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
  /** Who it is for; null = the household */
  memberId: string | null
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

/** For a transfer: Cash when it is not the source (ATM withdrawals), else the first other account that is not a meal-voucher card */
export function defaultToAccountId(accounts: AccountSummary[], fromId: string): string {
  const others = accounts.filter(a => !a.archived && a.id !== fromId && a.kind !== 'MEAL_VOUCHER')
  return (others.find(a => a.kind === 'CASH') ?? others[0])?.id ?? ''
}

/**
 * What a meal-voucher card would hold after this expense, when that is below zero;
 * null otherwise (another kind, not an expense, no amount yet, or it still fits).
 * An edited row's old amount is already in the balance, so it is taken back out first.
 */
export function voucherShortfall(accounts: AccountSummary[], draft: EntryDraft, editing: TransactionRow | null): number | null {
  const account = accounts.find(a => a.id === draft.accountId)
  if (account?.kind !== 'MEAL_VOUCHER' || draft.kind !== 'EXPENSE') return null
  const cents = parseMoney(draft.amount)
  if (cents === null || cents <= 0) return null
  const before = account.balanceCents - (editing && editing.transferId === null && editing.accountId === account.id ? editing.amountCents : 0)
  const after = before - cents
  return after < 0 ? after : null
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
    memberId: row.memberId,
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

export interface CardDraft {
  /** Local list key (React), stable while the form is open */
  key: string
  /** Set for a card that is already saved */
  id?: string
  last4: string
  holderMemberId: string | null
}

export interface AccountDraft {
  name: string
  kind: AccountKind
  /** null = no bank */
  institutionId: string | null
  openingBalance: string
  openingDate: string
  /** null = joint */
  holderMemberId: string | null
  cards: CardDraft[]
}

export type AccountDraftErrors = Partial<Record<'name' | 'openingBalance' | 'openingDate' | 'holder', string>> & {
  /** Per card key */
  cards?: Record<string, string>
}

/**
 * The input to save, or the i18n keys (under `accounts.errors`) of what is wrong.
 * `requireHolder`: members exist, so a meal-voucher card must name its parent.
 */
export function parseAccountDraft(draft: AccountDraft, requireHolder = false): { input: AccountInput } | { errors: AccountDraftErrors } {
  const errors: AccountDraftErrors = {}
  if (requireHolder && draft.kind === 'MEAL_VOUCHER' && !draft.holderMemberId) errors.holder = 'holder_required'
  const cents = draft.openingBalance.trim() === '' ? 0 : parseMoney(draft.openingBalance)
  if (!draft.name.trim()) errors.name = 'name_required'
  if (cents === null) errors.openingBalance = 'amount_invalid'
  if (!isDateOnly(draft.openingDate)) errors.openingDate = 'date_required'
  // Cash has no cards: switching an account to cash lets its cards go
  const cards = draft.kind === 'CASH' ? [] : draft.cards.map(c => ({ ...c, last4: c.last4.trim() }))
  const cardErrors: Record<string, string> = {}
  const seen = new Set<string>()
  for (const c of cards) {
    if (!/^\d{4}$/.test(c.last4)) cardErrors[c.key] = 'card_last4'
    else if (seen.has(c.last4)) cardErrors[c.key] = 'card_duplicate'
    seen.add(c.last4)
  }
  if (Object.keys(cardErrors).length > 0) errors.cards = cardErrors
  if (Object.keys(errors).length > 0 || cents === null) return { errors }
  return {
    input: {
      name: draft.name.trim(),
      kind: draft.kind,
      institutionId: draft.institutionId,
      openingBalanceCents: cents,
      openingDate: draft.openingDate,
      holderMemberId: draft.holderMemberId,
      cards: cards.map(c => ({ ...(c.id ? { id: c.id } : {}), last4: c.last4, holderMemberId: c.holderMemberId })),
    },
  }
}
