// Shapes for accounts, categories and transactions, shared by main (services)
// and the renderer (window.api types). Dates are 'yyyy-MM-dd' strings
// (src/shared/date-only.ts); amounts are integer cents.

export const ACCOUNT_KINDS = ['CURRENT', 'SAVINGS', 'CASH', 'CREDIT_CARD'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export const INSTITUTIONS = ['ALPHA', 'EUROBANK', 'OTHER'] as const
export type Institution = (typeof INSTITUTIONS)[number]

/** Display and picker order */
export const CATEGORY_TYPES = ['INCOME', 'BILL', 'SUBSCRIPTION', 'EXPENSE', 'DEBT', 'SAVINGS'] as const
export type CategoryType = (typeof CATEGORY_TYPES)[number]

// ── Accounts ─────────────────────────────────────────────────────────────────

export interface AccountSummary {
  id: string
  name: string
  kind: AccountKind
  institution: Institution
  currency: string
  openingBalanceCents: number
  openingDate: string
  /** Opening balance + every transaction */
  balanceCents: number
  transactionCount: number
  /** Last day covered by an import that was not undone; null for cash or before the first import */
  importedUntil: string | null
  archived: boolean
}

export interface AccountInput {
  name: string
  kind: AccountKind
  institution: Institution
  currency?: string
  openingBalanceCents: number
  openingDate: string
}

// ── Categories ───────────────────────────────────────────────────────────────

export interface CategoryNode {
  id: string
  name: string
  type: CategoryType
  icon: string | null
  parentId: string | null
  sortOrder: number
  /** Categories of a group; empty for a category */
  children: CategoryNode[]
}

export interface CategoryInput {
  name: string
  /** null = a new group */
  parentId?: string | null
  /** Required for a group; a category takes its group's type */
  type?: CategoryType
  icon?: string | null
}

// ── Transactions ─────────────────────────────────────────────────────────────

/** What the user enters; the stored sign follows from it (expense < 0, income > 0) */
export type EntryKind = 'EXPENSE' | 'INCOME'

export interface TransactionInput {
  kind: EntryKind
  accountId: string
  /** Positive cents; the sign comes from `kind` */
  amountCents: number
  bookedAt: string
  categoryId: string | null
  payee?: string | null
  note?: string | null
}

export interface TransferInput {
  fromAccountId: string
  toAccountId: string
  /** Positive cents */
  amountCents: number
  bookedAt: string
  note?: string | null
}

export interface TransactionRow {
  id: string
  accountId: string
  accountName: string
  bookedAt: string
  /** Signed: income > 0, expense < 0 */
  amountCents: number
  description: string
  payee: string | null
  note: string | null
  categoryId: string | null
  categoryName: string | null
  /** The group the category sits in (null for a group or no category) */
  categoryGroupName: string | null
  categoryType: CategoryType | null
  transferId: string | null
  /** The other side of a transfer */
  transferAccountId: string | null
  transferAccountName: string | null
  importBatchId: string | null
}

export interface TransactionFilter {
  /** 'yyyy-MM' */
  month?: string
  accountId?: string
  categoryType?: CategoryType
  categoryId?: string
  /** Rows that still need a category (transfers never do) */
  uncategorised?: boolean
  importBatchId?: string
  /** 1-based */
  page?: number
  pageSize?: number
}

export interface TransactionPage {
  rows: TransactionRow[]
  total: number
  page: number
  pageSize: number
  /** Totals of the filtered rows; transfers count as neither */
  incomeCents: number
  expenseCents: number
  /** Rows without a category in the same filter, ignoring the "to categorise" switch */
  uncategorisedCount: number
}

export interface PayeeSuggestion {
  payee: string
  /** Category of the latest row with this payee */
  categoryId: string | null
  accountId: string
}

/** Stored sign of an entered amount */
export function signedAmount(kind: EntryKind, amountCents: number): number {
  return kind === 'EXPENSE' ? -Math.abs(amountCents) : Math.abs(amountCents)
}
