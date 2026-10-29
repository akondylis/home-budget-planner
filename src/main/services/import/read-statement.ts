// File bytes → statement rows: decode, split into cells, find the columns, parse.

import { decodeStatement, type StatementEncoding } from './decode'
import { parseCsv, sniffDelimiter, type Delimiter } from './csv'
import { parseSavedMapping, profileFor, resolveColumns, resolveSavedMapping, type ProfileKey, type ResolvedMapping } from './profiles'
import { parseRows, type ParsedRow } from './parse-rows'
import type { AccountKind } from '../../../shared/ledger'
import type { ColumnMapping } from '../../../shared/statement-import'

export interface StatementAccount {
  importProfile: string | null
  importMapping: unknown
  /** The bank's preset family; null = the generic preset */
  statementPreset: string | null
  kind: AccountKind
}

export type ReadResult =
  | {
      ok: true
      encoding: StatementEncoding
      delimiter: Delimiter
      /** 'saved' = the column mapping stored on the account */
      profile: ProfileKey | 'saved'
      mapping: ResolvedMapping
      rows: ParsedRow[]
    }
  /** NO_ROWS: nothing that looks like a movement; UNKNOWN_FORMAT: columns not found (the mapping step shows `sample`) */
  | { ok: false; reason: 'NO_ROWS' | 'UNKNOWN_FORMAT'; sample: string[][] }

/**
 * Reads a statement with the account's saved mapping, else its preset, else the generic preset.
 * `mapping` (set by the user in the column mapping step) replaces all of them.
 */
export function readStatement(bytes: Uint8Array, account: StatementAccount, mapping?: ColumnMapping): ReadResult {
  const { text, encoding } = decodeStatement(bytes)
  const delimiter = sniffDelimiter(text)
  const cells = parseCsv(text, delimiter)
  const sample = cells.slice(0, 12)
  if (cells.length < 2) return { ok: false, reason: 'NO_ROWS', sample }

  const chosen = mapping ?? parseSavedMapping(account.importMapping)
  const fromMapping = chosen ? resolveSavedMapping(cells, chosen) : null
  const preset = profileFor(account)
  // A mapping the user just set has to fit; a stored one that no longer does falls back to the preset
  const resolved = fromMapping ?? (mapping ? null : resolveColumns(cells, preset))
  const profile: ProfileKey | 'saved' = fromMapping ? 'saved' : preset.key
  if (!resolved) return { ok: false, reason: 'UNKNOWN_FORMAT', sample }

  const rows = parseRows(cells, resolved)
  if (rows.length === 0) return { ok: false, reason: 'NO_ROWS', sample }
  return { ok: true, encoding, delimiter, profile, mapping: resolved, rows }
}
