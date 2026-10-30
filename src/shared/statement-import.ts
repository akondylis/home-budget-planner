// Statement import shapes shared by main (import engine) and the renderer
// (import wizard). Amounts are integer cents; dates 'yyyy-MM-dd'.

import type { DateOrder } from './date-format'
export type { DateOrder }

/** Where a preview row stands, from exact to fuzzy (see docs/domain-model.md) */
export const ROW_STATUSES = ['NEW', 'ALREADY_IMPORTED', 'POSSIBLE_DUPLICATE', 'TRANSFER_MATCH', 'INVALID'] as const
export type RowStatus = (typeof ROW_STATUSES)[number]

export type AmountMode = 'SIGNED' | 'DEBIT_CREDIT_COLUMNS' | 'AMOUNT_WITH_DC_FLAG'
export type DecimalSeparator = ',' | '.'

/** Statement columns the engine reads; the rest of a file is ignored */
export const MAPPING_FIELDS = ['date', 'valueDate', 'description', 'amount', 'debit', 'credit', 'dcFlag', 'balance', 'reference'] as const
export type MappingField = (typeof MAPPING_FIELDS)[number]

/**
 * How to read one bank's export. Saved on the account as `importMapping` when
 * no preset fits; columns are named by their header text, so a new file with
 * the same headers reads the same way.
 */
export interface ColumnMapping {
  columns: Partial<Record<MappingField, string>>
  dateOrder: DateOrder
  decimalSeparator: DecimalSeparator
  amountMode: AmountMode
  /** Card exports print purchases as positive amounts: flip so spending is negative */
  invertSign: boolean
  /** Flag values that mean money out, for AMOUNT_WITH_DC_FLAG (e.g. "Χ", "D") */
  debitFlags: string[]
}

/** Why a row could not be read */
export type RowProblem = 'DATE' | 'AMOUNT'

/** Hint for a row that looks like money moving between own accounts */
export type TransferHint = 'CARD_PAYMENT' | 'ATM'

export interface CategorySuggestion {
  categoryId: string
  payee: string | null
  /** A rule (with its pattern) or the category last used for this payee */
  source: { kind: 'rule'; ruleId: string; pattern: string } | { kind: 'history' }
}

export interface PreviewRow {
  /** 1-based line in the file, for "line 14 could not be read" */
  line: number
  status: RowStatus
  problem?: RowProblem
  bookedAt: string | null
  valueDate: string | null
  amountCents: number | null
  description: string
  bankReference: string | null
  /** Merchant part of the description (payeeKey()), for rules and "same payee" */
  payeeKey: string
  balanceAfterCents: number | null
  fingerprint: string | null
  suggestion: CategorySuggestion | null
  /** POSSIBLE_DUPLICATE: the hand-entered row it may be */
  duplicateOf: { id: string; bookedAt: string; amountCents: number; payee: string | null } | null
  /** TRANSFER_MATCH: the suggested other side, already in another own account (the user can pick something else) */
  transferWith: { id: string; accountId: string; accountName: string; bookedAt: string; amountCents: number; description: string } | null
  transferHint: TransferHint | null
}

export interface PreviewSummary {
  /** Rows per status */
  counts: Record<RowStatus, number>
  /** NEW rows (and transfer matches) without a category suggestion */
  toCategorise: number
  dateFrom: string | null
  dateTo: string | null
}

/** Bank presets the engine knows (src/main/services/import/profiles.ts) */
export type ProfileKey = 'alpha-account' | 'alpha-card' | 'eurobank-account' | 'eurobank-card' | 'generic'

/** A statement chosen in the native dialog; main keeps the path, the renderer only sees this */
export interface PickedFile {
  fileId: string
  fileName: string
}

export type PreviewResult =
  | {
      ok: true
      previewId: string
      accountId: string
      fileName: string
      /** 'saved' = the column mapping stored on the account (or the one just set) */
      profile: ProfileKey | 'saved'
      /** The same file was imported into this account before (and not undone) */
      sameFile: { importedAt: string; importedCount: number } | null
      summary: PreviewSummary
      rows: PreviewRow[]
    }
  /** The first rows of the file, so the column mapping step can show them */
  | { ok: false; reason: 'NO_ROWS' | 'UNKNOWN_FORMAT'; sample: string[][] }

export type ImportAction = 'IMPORT' | 'SKIP' | 'LINK' | 'TRANSFER'

/**
 * What to do with one row; rows without a decision get the default for their status.
 * TRANSFER pairs with `transferWith`, or with `toAccountId` when given (an ATM withdrawal → Cash, or a match the user changed),
 * where the other side is written too.
 */
export interface ImportDecision {
  line: number
  action: ImportAction
  /** undefined = the suggestion; null = no category */
  categoryId?: string | null
  payee?: string | null
  toAccountId?: string | null
}

/** The statement's closing balance next to the app's balance on the same day */
export interface Reconciliation {
  date: string
  statementBalanceCents: number
  appBalanceCents: number
}

export interface CommitResult {
  batchId: string
  importedCount: number
  linkedCount: number
  skippedCount: number
  /** Imported rows still without a category */
  toCategorise: number
  /** null when the file has no balance column */
  reconciliation: Reconciliation | null
}

export interface ImportHistoryItem {
  id: string
  accountId: string
  accountName: string
  fileName: string
  dateFrom: string
  dateTo: string
  importedAt: string
  importedCount: number
  skippedCount: number
  undone: boolean
  /** Checked now, so later edits show up; null when undone or the file had no balance */
  reconciliation: Reconciliation | null
}

// ── Category rules ───────────────────────────────────────────────────────────

export type RuleMatch = 'CONTAINS' | 'STARTS_WITH' | 'EXACT'

export interface RuleSummary {
  id: string
  /** Normalised payee key, e.g. "vasilopoulos" */
  pattern: string
  match: RuleMatch
  accountId: string | null
  /** null = all accounts */
  accountName: string | null
  categoryId: string
  categoryName: string
  payee: string | null
  priority: number
  /** Made by the household (not from the starter list) */
  learned: boolean
  hitCount: number
}

export interface RuleInput {
  /** Free text; stored normalised like payeeKey() */
  pattern: string
  categoryId: string
  payee?: string | null
  accountId?: string | null
  match?: RuleMatch
  /** Also sort the rows still waiting for a category that the rule matches */
  applyToUncategorised?: boolean
}

// ── Subscription hints ───────────────────────────────────────────────────────

export type SubscriptionInterval = 'MONTHLY' | 'YEARLY'

/** "Looks like a subscription: Netflix €13,99 monthly" */
export interface SubscriptionHint {
  /** payeeKey() of the merchant */
  key: string
  label: string
  /** Latest charge, positive */
  amountCents: number
  interval: SubscriptionInterval
  /** Charges in the steady run */
  count: number
  lastDate: string
  /** Category of the latest charge (null = not sorted yet) */
  categoryId: string | null
  /** The charges in the run, to sort them in one go */
  transactionIds: string[]
}
