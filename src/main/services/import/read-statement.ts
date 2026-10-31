// File bytes → statement rows: decode (CSV) or open the workbook (.xlsx), split into
// cells, find the columns, parse.

import { decodeStatement, type StatementEncoding } from './decode'
import { parseCsv, sniffDelimiter, type Delimiter } from './csv'
import { parseSavedMapping, profileFor, resolveColumns, resolveSavedMapping, type ProfileKey, type ResolvedMapping } from './profiles'
import { parseRows, type ParsedRow } from './parse-rows'
import { isXlsx, readXlsx, sheetRows } from './xlsx'
import type { AccountKind } from '../../../shared/ledger'
import type { ColumnMapping } from '../../../shared/statement-import'

export interface StatementAccount {
  importProfile: string | null
  importMapping: unknown
  /** The bank's preset family; null = the generic preset */
  statementPreset: string | null
  kind: AccountKind
  /** ISO code; rows in another currency cannot be read. Default EUR */
  currency?: string
}

export type ReadResult =
  | {
      ok: true
      /** How the file was read: a CSV's text encoding and separator, or an Excel workbook */
      source: { format: 'csv'; encoding: StatementEncoding; delimiter: Delimiter } | { format: 'xlsx' }
      /** 'saved' = the column mapping stored on the account */
      profile: ProfileKey | 'saved'
      mapping: ResolvedMapping
      rows: ParsedRow[]
    }
  /** NO_ROWS: nothing that looks like a movement; UNKNOWN_FORMAT: columns not found (the mapping step shows `sample`) */
  | { ok: false; reason: 'NO_ROWS' | 'UNKNOWN_FORMAT'; sample: string[][] }

type CellStyle = Pick<ColumnMapping, 'decimalSeparator' | 'dateOrder'>

/**
 * Reads a statement with the account's saved mapping, else its preset, else the generic preset.
 * `mapping` (set by the user in the column mapping step) replaces all of them.
 * Throws: 'IMPORT_FILE_UNREADABLE' (an .xlsx that is not a readable workbook)
 */
export function readStatement(bytes: Uint8Array, account: StatementAccount, mapping?: ColumnMapping): ReadResult {
  // A workbook keeps numbers and dates as values: they are written out the way each mapping reads them
  let source: Extract<ReadResult, { ok: true }>['source']
  let cellsFor: (style: CellStyle) => string[][]
  if (isXlsx(bytes)) {
    const sheet = readXlsx(bytes)
    source = { format: 'xlsx' }
    cellsFor = style => sheetRows(sheet, style)
  } else {
    const { text, encoding } = decodeStatement(bytes)
    const delimiter = sniffDelimiter(text)
    const cells = parseCsv(text, delimiter)
    source = { format: 'csv', encoding, delimiter }
    cellsFor = () => cells
  }

  const preset = profileFor(account)
  const presetCells = cellsFor(preset.options)
  const sample = presetCells.slice(0, 12)
  if (presetCells.filter(row => row.some(c => c.trim() !== '')).length < 2) return { ok: false, reason: 'NO_ROWS', sample }

  const chosen = mapping ?? parseSavedMapping(account.importMapping)
  const chosenCells = chosen ? cellsFor(chosen) : presetCells
  const fromMapping = chosen ? resolveSavedMapping(chosenCells, chosen) : null
  // A mapping the user just set has to fit; a stored one that no longer does falls back to the preset
  const resolved = fromMapping ?? (mapping ? null : resolveColumns(presetCells, preset))
  const profile: ProfileKey | 'saved' = fromMapping ? 'saved' : preset.key
  if (!resolved) return { ok: false, reason: 'UNKNOWN_FORMAT', sample }

  const rows = parseRows(fromMapping ? chosenCells : presetCells, resolved, account.currency)
  if (rows.length === 0) return { ok: false, reason: 'NO_ROWS', sample }
  return { ok: true, source, profile, mapping: resolved, rows }
}
