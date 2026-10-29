// The import wizard's review step without React: what each row starts as, what the
// user changed, and the decisions sent to `import:commit`. Kept pure for tests.

import type { AccountSummary } from '../../../shared/ledger'
import type {
  AmountMode,
  ColumnMapping,
  DateOrder,
  DecimalSeparator,
  ImportDecision,
  PreviewRow,
  RowStatus,
} from '../../../shared/statement-import'

/** Where a row goes: a category (null = sort it later), onto the hand-entered twin, or a transfer */
export type RowTarget =
  | { kind: 'category'; categoryId: string | null }
  | { kind: 'link' }
  /** null = the other side already in the app (`transferWith`) */
  | { kind: 'transfer'; toAccountId: string | null }

export interface RowChoice {
  include: boolean
  target: RowTarget
}

export type Choices = Record<number, RowChoice>

/** Only these rows can be ticked; the rest are already in the app or unreadable */
export const SELECTABLE: ReadonlySet<RowStatus> = new Set(['NEW', 'POSSIBLE_DUPLICATE', 'TRANSFER_MATCH'])

/** Cash accounts other than the one being imported, for "ATM withdrawal → Cash" */
export function cashAccounts(accounts: AccountSummary[], importingInto: string): AccountSummary[] {
  return accounts.filter(a => a.kind === 'CASH' && !a.archived && a.id !== importingInto)
}

/**
 * Own accounts a row can move money to (`outgoing`) or from: every active account but the one
 * being imported, cash first. Money never leaves a meal-voucher account by transfer.
 */
export function transferAccounts(accounts: AccountSummary[], importingInto: string, outgoing: boolean): AccountSummary[] {
  const source = accounts.find(a => a.id === importingInto)
  if (outgoing && source?.kind === 'MEAL_VOUCHER') return []
  return accounts
    .filter(a => !a.archived && a.id !== importingInto && (outgoing || a.kind !== 'MEAL_VOUCHER'))
    .sort((a, b) => Number(b.kind === 'CASH') - Number(a.kind === 'CASH') || a.name.localeCompare(b.name))
}

/**
 * What each row starts as: new rows in with their suggestion, transfers paired,
 * possible duplicates out (ticking one links it), an ATM withdrawal to Cash when there is one.
 */
export function initialChoice(row: PreviewRow, cashAccountId: string | null): RowChoice {
  switch (row.status) {
    case 'NEW':
      if (row.transferHint === 'ATM' && cashAccountId) return { include: true, target: { kind: 'transfer', toAccountId: cashAccountId } }
      return { include: true, target: { kind: 'category', categoryId: row.suggestion?.categoryId ?? null } }
    case 'TRANSFER_MATCH':
      return { include: true, target: { kind: 'transfer', toAccountId: null } }
    case 'POSSIBLE_DUPLICATE':
      return { include: false, target: { kind: 'link' } }
    default:
      return { include: false, target: { kind: 'category', categoryId: null } }
  }
}

export function initialChoices(rows: PreviewRow[], cashAccountId: string | null): Choices {
  return Object.fromEntries(rows.map(r => [r.line, initialChoice(r, cashAccountId)]))
}

/** The decision for one row; the service fills in the suggested payee */
export function toDecision(row: PreviewRow, choice: RowChoice): ImportDecision {
  if (!choice.include || !SELECTABLE.has(row.status)) return { line: row.line, action: 'SKIP' }
  const { target } = choice
  if (target.kind === 'link') return { line: row.line, action: 'LINK' }
  if (target.kind === 'transfer') {
    return target.toAccountId ? { line: row.line, action: 'TRANSFER', toAccountId: target.toAccountId } : { line: row.line, action: 'TRANSFER' }
  }
  return { line: row.line, action: 'IMPORT', categoryId: target.categoryId }
}

export function toDecisions(rows: PreviewRow[], choices: Choices): ImportDecision[] {
  return rows.map(r => toDecision(r, choices[r.line]))
}

/**
 * Whether a ticked row ends up as a row without a category. A card payment does not:
 * it waits for the card statement, which makes it a transfer.
 */
export function needsCategory(row: Pick<PreviewRow, 'transferHint'>, choice: RowChoice): boolean {
  return choice.include && choice.target.kind === 'category' && choice.target.categoryId === null && row.transferHint !== 'CARD_PAYMENT'
}

/** "Import 42 transactions" and "5 to categorise", live */
export function reviewCounts(rows: PreviewRow[], choices: Choices): { included: number; toCategorise: number } {
  let included = 0
  let toCategorise = 0
  for (const row of rows) {
    const choice = choices[row.line]
    if (!choice.include || !SELECTABLE.has(row.status)) continue
    included++
    if (needsCategory(row, choice)) toCategorise++
  }
  return { included, toCategorise }
}

/** What the summary chips filter by */
export type ReviewFilter = 'ALL' | RowStatus | 'TO_CATEGORISE'

export function filterRows(rows: PreviewRow[], choices: Choices, filter: ReviewFilter): PreviewRow[] {
  if (filter === 'ALL') return rows
  if (filter === 'TO_CATEGORISE') return rows.filter(r => SELECTABLE.has(r.status) && needsCategory(r, choices[r.line]))
  return rows.filter(r => r.status === filter)
}

/** Clickable review columns */
export type ReviewSortKey = 'date' | 'description' | 'amount'
export interface ReviewSort {
  key: ReviewSortKey
  direction: 'asc' | 'desc'
}

/**
 * Rows in the chosen column order; null keeps the statement's order.
 * Rows with no date or amount go last either way; ties keep statement order.
 */
export function sortRows(rows: PreviewRow[], sort: ReviewSort | null, locale: string): PreviewRow[] {
  if (!sort) return rows
  const sign = sort.direction === 'asc' ? 1 : -1
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  const value = (r: PreviewRow): string | number | null =>
    sort.key === 'date' ? r.bookedAt : sort.key === 'amount' ? r.amountCents : r.description.trim()
  return [...rows].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === null || va === '' || vb === null || vb === '') {
      const missing = Number(va === null || va === '') - Number(vb === null || vb === '')
      if (missing !== 0) return missing
    } else {
      const order = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : collator.compare(String(va), String(vb))
      if (order !== 0) return sign * order
    }
    return a.line - b.line
  })
}

/**
 * After "Always put X in Y": the other ticked rows of the same merchant that the
 * user has not sorted by hand take the category too. Returns the new choices and how many changed.
 */
export function applyToSamePayee(
  rows: PreviewRow[],
  choices: Choices,
  payeeKey: string,
  categoryId: string,
  touched: ReadonlySet<number>,
): { choices: Choices; changed: number } {
  const next = { ...choices }
  let changed = 0
  for (const row of rows) {
    const choice = choices[row.line]
    if (row.payeeKey !== payeeKey || touched.has(row.line) || !SELECTABLE.has(row.status)) continue
    if (choice.target.kind !== 'category' || choice.target.categoryId === categoryId) continue
    // A rule's suggestion stays: the user only taught this merchant, not that one
    if (choice.target.categoryId !== null && row.suggestion?.source.kind === 'rule') continue
    next[row.line] = { ...choice, target: { kind: 'category', categoryId } }
    changed++
  }
  return { choices: next, changed }
}

/**
 * Whether picking this category is worth a rule: the row came from a statement,
 * has a merchant, and no rule already puts it there.
 */
export function offersRule(row: Pick<PreviewRow, 'payeeKey' | 'suggestion'>, categoryId: string): boolean {
  if (!row.payeeKey) return false
  return !(row.suggestion?.source.kind === 'rule' && row.suggestion.categoryId === categoryId)
}

// ── Column mapping ───────────────────────────────────────────────────────────

/** The first row with three or more filled cells: where column names usually are */
export function guessHeaderRow(sample: string[][]): number {
  const index = sample.findIndex(r => r.filter(c => c.trim() !== '').length >= 3)
  return index < 0 ? 0 : index
}

/** Column names the user can pick: filled and not repeated (a mapping names columns by their text) */
export function headerOptions(header: string[]): string[] {
  const names = header.map(c => c.trim()).filter(c => c !== '')
  return names.filter(n => names.indexOf(n) === names.lastIndexOf(n))
}

export interface MappingForm {
  date: string
  description: string
  amountMode: Extract<AmountMode, 'SIGNED' | 'DEBIT_CREDIT_COLUMNS'>
  amount: string
  debit: string
  credit: string
  balance: string
  dateOrder: DateOrder
  decimalSeparator: DecimalSeparator
  invertSign: boolean
}

export type MappingField = 'date' | 'description' | 'amount' | 'debit' | 'credit'

/** The required fields still empty; one of money out / money in is enough */
export function missingFields(form: MappingForm): MappingField[] {
  const missing: MappingField[] = []
  if (!form.date) missing.push('date')
  if (!form.description) missing.push('description')
  if (form.amountMode === 'SIGNED' && !form.amount) missing.push('amount')
  if (form.amountMode === 'DEBIT_CREDIT_COLUMNS' && !form.debit && !form.credit) missing.push('debit', 'credit')
  return missing
}

export function toColumnMapping(form: MappingForm): ColumnMapping {
  const columns: ColumnMapping['columns'] = { date: form.date, description: form.description }
  if (form.amountMode === 'SIGNED') columns.amount = form.amount
  else {
    if (form.debit) columns.debit = form.debit
    if (form.credit) columns.credit = form.credit
  }
  if (form.balance) columns.balance = form.balance
  return {
    columns,
    dateOrder: form.dateOrder,
    decimalSeparator: form.decimalSeparator,
    amountMode: form.amountMode,
    invertSign: form.invertSign,
    debitFlags: [],
  }
}
