import type { MemberColour } from './members'

// Shapes for accounts, categories and transactions, shared by main (services)
// and the renderer (window.api types). Dates are 'yyyy-MM-dd' strings
// (src/shared/date-only.ts); amounts are integer cents.

export const ACCOUNT_KINDS = ['CURRENT', 'SAVINGS', 'CASH', 'CREDIT_CARD', 'MEAL_VOUCHER'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

/** BANK: accounts and cards; VOUCHER_ISSUER: meal-voucher cards (Edenred, Up Hellas) */
export const INSTITUTION_KINDS = ['BANK', 'VOUCHER_ISSUER'] as const
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number]

/** The kind of institution an account of this kind is offered: meal-voucher cards come from voucher issuers */
export function institutionKindFor(kind: AccountKind): InstitutionKind {
  return kind === 'MEAL_VOUCHER' ? 'VOUCHER_ISSUER' : 'BANK'
}

/** Money that can pay for anything: every kind but a meal-voucher card (food only, never withdrawn) */
export function isSpendable(kind: AccountKind): boolean {
  return kind !== 'MEAL_VOUCHER'
}

/** Display and picker order */
export const CATEGORY_TYPES = ['INCOME', 'BILL', 'SUBSCRIPTION', 'EXPENSE', 'DEBT', 'SAVINGS'] as const
export type CategoryType = (typeof CATEGORY_TYPES)[number]

// ── Banks ────────────────────────────────────────────────────────────────────

/** A bank or meal-voucher issuer from the user's list */
export interface InstitutionSummary {
  id: string
  name: string
  kind: InstitutionKind
  /** Statement preset family ("alpha" | "eurobank"); null = the generic preset */
  statementPreset: string | null
  archived: boolean
  /** Active accounts at it */
  accountCount: number
}

export interface InstitutionInput {
  name: string
  kind: InstitutionKind
}

// ── Accounts ─────────────────────────────────────────────────────────────────

export interface AccountSummary {
  id: string
  name: string
  kind: AccountKind
  /** null = no bank */
  institutionId: string | null
  institutionName: string | null
  currency: string
  openingBalanceCents: number
  openingDate: string
  /** Opening balance + every transaction */
  balanceCents: number
  transactionCount: number
  /** Last day covered by an import that was not undone; null for cash or before the first import */
  importedUntil: string | null
  archived: boolean
  /** The parent whose account it is; null = joint */
  holderMemberId: string | null
  holderName: string | null
  holderColour: MemberColour | null
  /** In their saved order */
  cards: CardSummary[]
}

export interface CardSummary {
  id: string
  /** 4 digits */
  last4: string
  holderMemberId: string | null
  holderName: string | null
  holderColour: MemberColour | null
}

export interface CardInput {
  /** Set for a card that already exists on this account */
  id?: string
  last4: string
  holderMemberId: string | null
}

export interface AccountInput {
  name: string
  kind: AccountKind
  /** null = no bank; a meal-voucher card names a voucher issuer or none */
  institutionId: string | null
  currency?: string
  openingBalanceCents: number
  openingDate: string
  /** null = joint */
  holderMemberId?: string | null
  /** The whole card list, in order; left out = the cards stay as they are */
  cards?: CardInput[]
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

/** A node of the Categories page: archived ones included, with what uses them */
export interface ManagedCategoryNode extends Omit<CategoryNode, 'children'> {
  archived: boolean
  /** Rows sorted into it (a group: 0, its categories carry the rows) */
  transactionCount: number
  ruleCount: number
  children: ManagedCategoryNode[]
}

export interface MergeResult {
  transactions: number
  rules: number
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
  /** Who it was for; null = the household */
  memberId?: string | null
  /** The member using the app (create only; ignored on update) */
  createdByMemberId?: string | null
}

export interface TransferInput {
  fromAccountId: string
  toAccountId: string
  /** Positive cents */
  amountCents: number
  bookedAt: string
  note?: string | null
  createdByMemberId?: string | null
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
  /** Who it was for; null = the household */
  memberId: string | null
  memberName: string | null
  memberColour: MemberColour | null
  /** Who entered or imported it; null before members existed */
  createdByName: string | null
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
  /** A member id, or HOUSEHOLD ('household') for rows that are for no one parent */
  memberId?: string
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
  /** Member of the latest row with this payee (null = the household) */
  memberId: string | null
}

/** Stored sign of an entered amount */
export function signedAmount(kind: EntryKind, amountCents: number): number {
  return kind === 'EXPENSE' ? -Math.abs(amountCents) : Math.abs(amountCents)
}
