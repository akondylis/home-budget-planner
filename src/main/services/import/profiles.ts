// Statement presets per bank and source, and finding the header row in a file.
//
// The Alpha Bank and Eurobank layouts (column positions) are the ones the household's
// own converter has read their exports with for years. Piraeus (account, .xlsx) and
// Revolut (account, CSV) were taken from real exports on 2026-10-30; Viva Wallet (an
// HTML table named .xls), Eurobank's reserved card payments and the Alpha account
// header from real exports on 2026-10-31. The header
// aliases are a fallback for when a bank moves its columns. A file neither reads goes
// to the column-mapping step, and that mapping is saved on the account.

import { z } from 'zod'
import { normalise } from '../../../shared/search-normalise'
import type { AccountKind } from '../../../shared/ledger'
import { MAPPING_FIELDS, type AmountMode, type ColumnMapping, type MappingField, type ProfileKey } from '../../../shared/statement-import'
import { parseStatementAmount, parseStatementDate } from './parse-rows'

export type { ProfileKey }

export interface StatementProfile {
  key: ProfileKey
  /** Header texts that name each column, matched after normalise() */
  aliases: Partial<Record<MappingField, string[]>>
  options: Omit<ColumnMapping, 'columns'>
  /** Where a bank's export is known to keep its columns; tried before the aliases */
  layout?: StatementLayout
}

export interface StatementLayout {
  /** A fixed row, or the first row with every one of these texts in its cells */
  header: { row: number } | { contains: string[] }
  columns: Partial<Record<MappingField, number>>
  amountMode: AmountMode
  /** Bank-specific columns the mapping step does not offer */
  extras?: LayoutExtras
}

export interface LayoutExtras {
  /** A second text column added to the description (Piraeus keeps the payee in its comments) */
  detail?: number
  /** A fee column taken off the amount, so the bank's running balance still matches (Revolut) */
  fee?: number
  /** Rows are movements only when these columns hold one of the values (Revolut: State COMPLETED, Product Current) */
  keep?: { column: number; values: string[] }[]
  /** The row's currency; a row not in the account's currency cannot be read */
  currency?: number
  /**
   * Card payments the bank has reserved but not booked: every row of the file (Eurobank's
   * reserved file), or rows whose column is empty (Viva: no post date yet)
   */
  pending?: 'all' | { whenEmpty: number }
  /** A category name typed by the household (the cash template); matched to a category in the preview */
  category?: number
}

// Words Greek banks put in their column headers
const COMMON: Partial<Record<MappingField, string[]>> = {
  date: ['Ημερομηνία', 'Ημ/νία', 'Ημερομηνία Συναλλαγής', 'Ημ/νία Συναλλαγής', 'Ημερομηνία Κίνησης', 'Ημ/νία Κίνησης', 'Date', 'Transaction Date'],
  valueDate: ['Ημερομηνία Αξίας', 'Ημ/νία Αξίας', 'Αξία', 'Value Date'],
  description: ['Περιγραφή', 'Αιτιολογία', 'Περιγραφή Συναλλαγής', 'Περιγραφή Κίνησης', 'Description', 'Details'],
  amount: ['Ποσό', 'Ποσό Συναλλαγής', 'Ποσό σε EUR', 'Ποσό (EUR)', 'Amount'],
  // Έξοδο / Έσοδο: the cash template's columns, so a template with its columns moved still reads
  debit: ['Χρέωση', 'Χρεώσεις', 'Ανάληψη', 'Debit', 'Έξοδο', 'Έξοδα', 'Expense'],
  credit: ['Πίστωση', 'Πιστώσεις', 'Κατάθεση', 'Credit', 'Έσοδο', 'Έσοδα', 'Income'],
  dcFlag: ['Χ/Π', 'Χ-Π', 'Πρόσημο', 'Πρόσημο Ποσού', 'D/C', 'DC'],
  balance: ['Υπόλοιπο', 'Λογιστικό Υπόλοιπο', 'Balance'],
  reference: ['Αρ. Συναλλαγής', 'Αριθμός Συναλλαγής', 'Αρ. Αναφοράς', 'Αριθμός Αναφοράς', 'Κωδικός Συναλλαγής', 'Reference'],
}

const DEBIT_FLAGS = ['Χ', 'Χρ', 'Χρέωση', 'D', 'DR', 'Debit', '-']

const account = (key: ProfileKey, layout?: StatementLayout, style?: Pick<ColumnMapping, 'dateOrder' | 'decimalSeparator'>): StatementProfile => ({
  key,
  aliases: COMMON,
  options: { dateOrder: 'DMY', decimalSeparator: ',', amountMode: 'SIGNED', invertSign: false, debitFlags: DEBIT_FLAGS, ...style },
  layout,
})

// Card statements: a purchase is printed as a positive amount owed
const card = (key: ProfileKey, layout?: StatementLayout): StatementProfile => {
  const base = account(key, layout)
  return { ...base, options: { ...base.options, invertSign: true } }
}

// Alpha account: the amount has no sign; a flag column says Π (money in) or Χ (money out).
// The real export heads its date column "Ημ/νία" (a line above has "Ημ/νία" too, without "Ποσό").
const ALPHA_ACCOUNT: StatementLayout = {
  header: { contains: ['Αιτιολογία', 'Ποσό'] },
  columns: { date: 1, description: 2, amount: 6, dcFlag: 7 },
  amountMode: 'AMOUNT_WITH_DC_FLAG',
}
const ALPHA_CARD: StatementLayout = { header: { contains: ['Ημ/νία συναλλαγής'] }, columns: { date: 0, description: 1, amount: 4 }, amountMode: 'SIGNED' }
// Eurobank prints the same columns for the account and the card
const EUROBANK: StatementLayout = { header: { row: 0 }, columns: { date: 0, description: 2, amount: 3 }, amountMode: 'SIGNED' }
// Eurobank's reserved debit-card payments: ΗΜ/ΝΙΑ ΣΥΝΑΛΛΑΓΗΣ, ΗΜ/ΝΙΑ ΕΓΓΡΑΦΗΣ (the day it will be booked), ΠΕΡΙΓΡΑΦΗ, ΠΟΣΟ (signed).
// Imported into the current account as pending; the account statement's row replaces each one later.
const EUROBANK_RESERVED: StatementLayout = {
  header: { contains: ['ΗΜ/ΝΙΑ ΕΓΓΡΑΦΗΣ'] },
  columns: { date: 0, description: 2, amount: 3 },
  amountMode: 'SIGNED',
  extras: { pending: 'all' },
}
// Piraeus account (.xlsx, below a few lines about the account): Κατηγορία, Περιγραφή Συναλλαγής, Ημ/νία Συναλλαγής,
// Σχόλια / Κωδικός Αναφοράς, Ποσό, Νόμισμα, Προοδευτικό Λογιστικό Υπόλοιπο, Νόμισμα. The description is the bank's
// generic text ("ΜΕΤΑΦΟΡΑ ΣΕ ΛΟΓ.ΤΡΙΤΟΥ"); who it went to is in the comments.
const PIRAEUS_ACCOUNT: StatementLayout = {
  header: { contains: ['Ημ/νία Συναλλαγής', 'Ποσό'] },
  columns: { date: 2, description: 1, amount: 4, balance: 6 },
  amountMode: 'SIGNED',
  extras: { detail: 3, currency: 5 },
}
// Revolut: Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance.
// A pending payment has no completed date yet, so it is not a movement until it completes.
const REVOLUT: StatementLayout = {
  header: { contains: ['Completed Date', 'State'] },
  columns: { date: 3, description: 4, amount: 5, balance: 9 },
  amountMode: 'SIGNED',
  extras: { fee: 6, currency: 7, keep: [{ column: 8, values: ['COMPLETED'] }, { column: 1, values: ['Current'] }] },
}

// Viva Wallet (HTML table): Transaction ID, Post Date, Post Time, Transaction Date, Description, Card Number, Currency,
// Amount (signed), Balance, Available, Holds. The transaction date is the booked date (user, 2026-10-31); fees come as
// rows of their own. A row with no post date yet is taken as pending (assumed: the sample file had none).
const VIVA: StatementLayout = {
  header: { contains: ['Transaction Date', 'Post Date'] },
  columns: { date: 3, description: 4, amount: 7, balance: 8, reference: 0 },
  amountMode: 'SIGNED',
  extras: { currency: 6, pending: { whenEmpty: 1 } },
}

// Meal-card list (card-list.ts makes this table from a pasted or saved page): Date, Description, Amount (signed, dot decimal)
const CARD_LIST: StatementLayout = { header: { row: 0 }, columns: { date: 0, description: 1, amount: 2 }, amountMode: 'SIGNED' }

// Cash template (src/shared/cash-template.ts): Date, Description, Expense, Income, Category; one of the two amounts per row
const CASH_TEMPLATE: StatementLayout = {
  header: { row: 0 },
  columns: { date: 0, description: 1, debit: 2, credit: 3 },
  amountMode: 'DEBIT_CREDIT_COLUMNS',
  extras: { category: 4 },
}

export const PROFILES: Record<ProfileKey, StatementProfile> = {
  'alpha-account': account('alpha-account', ALPHA_ACCOUNT),
  'alpha-card': card('alpha-card', ALPHA_CARD),
  'eurobank-account': account('eurobank-account', EUROBANK),
  'eurobank-card': card('eurobank-card', EUROBANK),
  'eurobank-reserved': account('eurobank-reserved', EUROBANK_RESERVED),
  'piraeus-account': account('piraeus-account', PIRAEUS_ACCOUNT),
  'revolut-account': account('revolut-account', REVOLUT, { dateOrder: 'YMD', decimalSeparator: '.' }),
  'viva-account': account('viva-account', VIVA),
  'card-list': account('card-list', CARD_LIST, { dateOrder: 'DMY', decimalSeparator: '.' }),
  'cash-template': account('cash-template', CASH_TEMPLATE),
  generic: account('generic'),
}

/**
 * Preset families a bank can name (`Institution.statementPreset`), with the preset for its
 * accounts and its cards. No card preset = a card of that bank reads with the generic card one
 * (no Piraeus card export seen yet); Revolut and Viva cards are on the account's statement.
 * `variants`: other files of the bank's accounts, read with their own preset when their layout fits.
 */
const PRESET_BANKS: Record<string, { account: ProfileKey; card?: ProfileKey; variants?: ProfileKey[] }> = {
  alpha: { account: 'alpha-account', card: 'alpha-card' },
  eurobank: { account: 'eurobank-account', card: 'eurobank-card', variants: ['eurobank-reserved'] },
  piraeus: { account: 'piraeus-account' },
  revolut: { account: 'revolut-account', card: 'revolut-account' },
  viva: { account: 'viva-account', card: 'viva-account' },
}

/** The bank's other file presets for an account (none for credit cards, or when a preset is saved on the account) */
export function variantsFor(account: { importProfile: string | null; statementPreset: string | null; kind: AccountKind }): StatementProfile[] {
  if (account.kind === 'CREDIT_CARD' || account.importProfile || !account.statementPreset || !Object.hasOwn(PRESET_BANKS, account.statementPreset)) return []
  return (PRESET_BANKS[account.statementPreset].variants ?? []).map(key => PROFILES[key])
}

/**
 * Headers of debit-card exports. Their payments are already on the account statement, so
 * reading one into a current account would count each payment twice (user, 2026-11-01: stop).
 * Every `contains` text must be in one header row, and none of `without`.
 */
const DEBIT_CARD_FILES: { contains: string[]; without?: string[] }[] = [
  // Eurobank debit-card-transactions (the account file has a balance column; the reserved file ΗΜ/ΝΙΑ ΕΓΓΡΑΦΗΣ)
  { contains: ['ΗΜ/ΝΙΑ ΣΥΝΑΛΛΑΓΗΣ', 'ΗΜ/ΝΙΑ ΑΞΙΑΣ'], without: ['ΥΠΟΛΟΙΠΟ', 'ΗΜ/ΝΙΑ ΕΓΓΡΑΦΗΣ'] },
  // Alpha "Κινήσεις κάρτας" (debit cards such as Enter Visa)
  { contains: ['Ημ/νία συναλλαγής', 'Κατάσταση συναλλαγής'] },
  // Piraeus "Κινήσεις Χρεωστικών Καρτών"
  { contains: ['Αριθμός Παραστατικού', 'Ανθρακικό Αποτύπωμα'] },
]

/** A debit card's own export, picked for an account that is not a credit card */
export function isDebitCardFile(rows: string[][], kind: AccountKind): boolean {
  if (kind === 'CREDIT_CARD') return false
  const has = (row: string[], text: string) => row.some(c => normalise(c).includes(normalise(text)))
  return rows.slice(0, 30).some(row =>
    DEBIT_CARD_FILES.some(f => f.contains.every(t => has(row, t)) && !(f.without ?? []).some(t => has(row, t))),
  )
}

/** The preset an account starts from: the one saved on it, else its bank's preset family and its kind */
export function profileFor(account: { importProfile: string | null; statementPreset: string | null; kind: AccountKind }): StatementProfile {
  // Meal-card issuers have no export: their page's list is read whatever the issuer
  if (account.kind === 'MEAL_VOUCHER') return PROFILES['card-list']
  if (account.importProfile && account.importProfile in PROFILES) return PROFILES[account.importProfile as ProfileKey]
  // Cash has no bank: the household fills in the app's template
  if (account.kind === 'CASH') return PROFILES['cash-template']
  const bank = account.statementPreset && Object.hasOwn(PRESET_BANKS, account.statementPreset) ? PRESET_BANKS[account.statementPreset] : null
  const isCard = account.kind === 'CREDIT_CARD'
  const key = isCard ? bank?.card : bank?.account
  if (key) return PROFILES[key]
  return isCard ? card('generic') : PROFILES.generic
}

// ── Finding the columns ──────────────────────────────────────────────────────

/** Column indexes of a file, after its header row */
export interface ResolvedMapping {
  headerRow: number
  columns: Partial<Record<MappingField, number>>
  options: Omit<ColumnMapping, 'columns'>
  /** Set when the bank's known layout was used */
  extras?: LayoutExtras
}

/** A header row is usable when it names a date, a description and some way to read the amount */
export function isComplete(columns: Partial<Record<MappingField, number>>, amountMode: ColumnMapping['amountMode']): boolean {
  if (columns.date === undefined || columns.description === undefined) return false
  if (amountMode === 'DEBIT_CREDIT_COLUMNS') return columns.debit !== undefined || columns.credit !== undefined
  if (amountMode === 'AMOUNT_WITH_DC_FLAG') return columns.amount !== undefined && columns.dcFlag !== undefined
  return columns.amount !== undefined
}

/** Each field's column in one header row: exact names first, then a header that contains the alias */
function matchHeader(header: string[], aliases: Partial<Record<MappingField, string[]>>): Partial<Record<MappingField, number>> {
  const cells = header.map(h => normalise(h))
  const taken = new Set<number>()
  const columns: Partial<Record<MappingField, number>> = {}
  for (const pass of ['exact', 'contains'] as const) {
    for (const field of MAPPING_FIELDS) {
      if (columns[field] !== undefined) continue
      for (const alias of (aliases[field] ?? []).map(a => normalise(a))) {
        const index = cells.findIndex((c, i) => !taken.has(i) && c !== '' && (pass === 'exact' ? c === alias : alias.length >= 4 && c.includes(alias)))
        if (index >= 0) {
          columns[field] = index
          taken.add(index)
          break
        }
      }
    }
  }
  return columns
}

const OPTIONAL_FIELDS: MappingField[] = ['valueDate', 'balance', 'reference']

/**
 * A bank's known layout applied to a file, when the first rows after its header have a
 * date and an amount where the layout says and no header names those columns as
 * something else (a changed export falls back to the aliases). Value date, balance and
 * reference come from the header names when present.
 */
export function resolveLayout(rows: string[][], profile: StatementProfile): ResolvedMapping | null {
  const layout = profile.layout
  if (!layout) return null
  const { header } = layout
  const headerRow = 'row' in header
    ? header.row
    : rows.slice(0, 30).findIndex(row => header.contains.every(m => row.some(c => normalise(c).includes(normalise(m)))))
  if (headerRow < 0 || headerRow >= rows.length) return null

  const { date, amount, debit, credit } = layout.columns
  const dated = rows.slice(headerRow + 1, headerRow + 11).filter(row => parseStatementDate(row[date!] ?? '', profile.options.dateOrder) !== null)
  const text = (row: string[], i: number | undefined) => (i === undefined ? '' : (row[i] ?? '').trim())
  const parses = (row: string[], i: number | undefined) => parseStatementAmount(text(row, i), profile.options.decimalSeparator) !== null
  if (dated.length === 0) return null
  if (layout.amountMode === 'DEBIT_CREDIT_COLUMNS') {
    // Each row fills one of the two; what is filled must be a number (a row with neither is flagged later, not a sign of another layout)
    const filled = dated.flatMap(row => [debit, credit].filter(i => text(row, i) !== '').map(i => parses(row, i)))
    if (filled.length === 0 || filled.includes(false)) return null
  } else if (!dated.every(row => parses(row, amount))) return null

  // e.g. a balance column where the layout expects the amount
  const named = Object.entries(matchHeader(rows[headerRow], profile.aliases))
  if (named.some(([field, i]) => Object.entries(layout.columns).some(([f, c]) => c === i && f !== field))) return null

  const used = new Set(Object.values(layout.columns))
  const extra = named.filter(([field, i]) => OPTIONAL_FIELDS.includes(field as MappingField) && !used.has(i))
  return {
    headerRow,
    columns: { ...Object.fromEntries(extra), ...layout.columns },
    options: { ...profile.options, amountMode: layout.amountMode },
    ...(layout.extras ? { extras: layout.extras } : {}),
  }
}

/**
 * The header row and columns of a file for a preset (statements often start with a few
 * lines about the account): the bank's known layout first, then the header names. With
 * names, the amount mode follows the columns found: separate debit and credit columns,
 * an amount with a Χ/Π flag, or a signed amount. null = not found.
 */
export function resolveColumns(rows: string[][], profile: StatementProfile): ResolvedMapping | null {
  const fromLayout = resolveLayout(rows, profile)
  if (fromLayout) return fromLayout
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const columns = matchHeader(rows[r], profile.aliases)
    const amountMode: ColumnMapping['amountMode'] =
      columns.debit !== undefined && columns.credit !== undefined && columns.amount === undefined ? 'DEBIT_CREDIT_COLUMNS'
        : columns.amount !== undefined && columns.dcFlag !== undefined ? 'AMOUNT_WITH_DC_FLAG'
          : 'SIGNED'
    // A bank that prints amounts without a sign must not be read as signed: every row would be money in
    if (profile.layout?.amountMode === 'AMOUNT_WITH_DC_FLAG' && amountMode === 'SIGNED') continue
    if (isComplete(columns, amountMode)) return { headerRow: r, columns, options: { ...profile.options, amountMode } }
  }
  return null
}

// ── A mapping saved on the account ──────────────────────────────────────────

const mappingSchema = z.object({
  columns: z.record(z.enum(MAPPING_FIELDS), z.string().min(1)),
  dateOrder: z.enum(['DMY', 'MDY', 'YMD']),
  decimalSeparator: z.enum([',', '.']),
  amountMode: z.enum(['SIGNED', 'DEBIT_CREDIT_COLUMNS', 'AMOUNT_WITH_DC_FLAG']),
  invertSign: z.boolean(),
  debitFlags: z.array(z.string()),
})

/** The account's `importMapping` JSON, or null when it is missing or not valid */
export function parseSavedMapping(json: unknown): ColumnMapping | null {
  const parsed = mappingSchema.safeParse(json)
  return parsed.success ? (parsed.data as ColumnMapping) : null
}

/** Applies a saved mapping (columns by header text) to a file */
export function resolveSavedMapping(rows: string[][], mapping: ColumnMapping): ResolvedMapping | null {
  const { columns: named, ...options } = mapping
  const aliases = Object.fromEntries(Object.entries(named).map(([field, header]) => [field, [header]])) as StatementProfile['aliases']
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const columns = matchHeader(rows[r], aliases)
    if (Object.keys(named).every(f => columns[f as MappingField] !== undefined) && isComplete(columns, options.amountMode)) {
      return { headerRow: r, columns, options }
    }
  }
  return null
}
