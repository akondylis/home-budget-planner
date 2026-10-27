// Statement presets per bank and source, and finding the header row in a file.
//
// UNVERIFIED: the aliases and options below are what Alpha Bank and Eurobank
// exports are known to use, not yet checked against real files (Phase 2 gate in
// .claude/plans/in-the-app-i-quizzical-stroustrup.md). A file no preset reads
// goes to the column-mapping step, and that mapping is saved on the account.

import { z } from 'zod'
import { normalise } from '../../../shared/search-normalise'
import type { AccountKind, Institution } from '../../../shared/ledger'
import { MAPPING_FIELDS, type ColumnMapping, type MappingField, type ProfileKey } from '../../../shared/statement-import'

export type { ProfileKey }

export interface StatementProfile {
  key: ProfileKey
  /** Header texts that name each column, matched after normalise() */
  aliases: Partial<Record<MappingField, string[]>>
  options: Omit<ColumnMapping, 'columns'>
}

// Words Greek banks put in their column headers
const COMMON: Partial<Record<MappingField, string[]>> = {
  date: ['Ημερομηνία', 'Ημ/νία', 'Ημερομηνία Συναλλαγής', 'Ημ/νία Συναλλαγής', 'Ημερομηνία Κίνησης', 'Ημ/νία Κίνησης', 'Date', 'Transaction Date'],
  valueDate: ['Ημερομηνία Αξίας', 'Ημ/νία Αξίας', 'Αξία', 'Value Date'],
  description: ['Περιγραφή', 'Αιτιολογία', 'Περιγραφή Συναλλαγής', 'Περιγραφή Κίνησης', 'Description', 'Details'],
  amount: ['Ποσό', 'Ποσό Συναλλαγής', 'Ποσό σε EUR', 'Ποσό (EUR)', 'Amount'],
  debit: ['Χρέωση', 'Χρεώσεις', 'Ανάληψη', 'Debit'],
  credit: ['Πίστωση', 'Πιστώσεις', 'Κατάθεση', 'Credit'],
  dcFlag: ['Χ/Π', 'Χ-Π', 'Πρόσημο', 'Πρόσημο Ποσού', 'D/C', 'DC'],
  balance: ['Υπόλοιπο', 'Λογιστικό Υπόλοιπο', 'Balance'],
  reference: ['Αρ. Συναλλαγής', 'Αριθμός Συναλλαγής', 'Αρ. Αναφοράς', 'Αριθμός Αναφοράς', 'Κωδικός Συναλλαγής', 'Reference'],
}

const DEBIT_FLAGS = ['Χ', 'Χρ', 'Χρέωση', 'D', 'DR', 'Debit', '-']

const account = (key: ProfileKey): StatementProfile => ({
  key,
  aliases: COMMON,
  options: { dateOrder: 'DMY', decimalSeparator: ',', amountMode: 'SIGNED', invertSign: false, debitFlags: DEBIT_FLAGS },
})

// Card statements: a purchase is printed as a positive amount owed
const card = (key: ProfileKey): StatementProfile => ({ ...account(key), options: { ...account(key).options, invertSign: true } })

export const PROFILES: Record<ProfileKey, StatementProfile> = {
  'alpha-account': account('alpha-account'),
  'alpha-card': card('alpha-card'),
  'eurobank-account': account('eurobank-account'),
  'eurobank-card': card('eurobank-card'),
  generic: account('generic'),
}

/** The preset an account starts from: the one saved on it, else its bank and kind */
export function profileFor(account: { importProfile: string | null; institution: Institution; kind: AccountKind }): StatementProfile {
  if (account.importProfile && account.importProfile in PROFILES) return PROFILES[account.importProfile as ProfileKey]
  const bank = account.institution === 'ALPHA' ? 'alpha' : account.institution === 'EUROBANK' ? 'eurobank' : null
  if (!bank) return account.kind === 'CREDIT_CARD' ? card('generic') : PROFILES.generic
  return PROFILES[`${bank}-${account.kind === 'CREDIT_CARD' ? 'card' : 'account'}`]
}

// ── Finding the columns ──────────────────────────────────────────────────────

/** Column indexes of a file, after its header row */
export interface ResolvedMapping {
  headerRow: number
  columns: Partial<Record<MappingField, number>>
  options: Omit<ColumnMapping, 'columns'>
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

/**
 * The header row and columns of a file for a preset (statements often start with a few
 * lines about the account). The amount mode follows the columns found: separate debit
 * and credit columns, an amount with a Χ/Π flag, or a signed amount. null = not found.
 */
export function resolveColumns(rows: string[][], profile: StatementProfile): ResolvedMapping | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const columns = matchHeader(rows[r], profile.aliases)
    const amountMode: ColumnMapping['amountMode'] =
      columns.debit !== undefined && columns.credit !== undefined && columns.amount === undefined ? 'DEBIT_CREDIT_COLUMNS'
        : columns.amount !== undefined && columns.dcFlag !== undefined ? 'AMOUNT_WITH_DC_FLAG'
          : 'SIGNED'
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
