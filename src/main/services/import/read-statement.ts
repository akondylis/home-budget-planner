// File bytes → statement rows: decode, split into cells, find the columns, parse.

import { decodeStatement, type StatementEncoding } from './decode'
import { parseCsv, sniffDelimiter, type Delimiter } from './csv'
import { parseSavedMapping, profileFor, resolveColumns, resolveSavedMapping, type ProfileKey, type ResolvedMapping } from './profiles'
import { parseRows, type ParsedRow } from './parse-rows'
import type { AccountKind, Institution } from '../../../shared/ledger'

export interface StatementAccount {
  importProfile: string | null
  importMapping: unknown
  institution: Institution
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

/** Reads a statement with the account's saved mapping, else its preset, else the generic preset */
export function readStatement(bytes: Uint8Array, account: StatementAccount): ReadResult {
  const { text, encoding } = decodeStatement(bytes)
  const delimiter = sniffDelimiter(text)
  const cells = parseCsv(text, delimiter)
  const sample = cells.slice(0, 12)
  if (cells.length < 2) return { ok: false, reason: 'NO_ROWS', sample }

  const saved = parseSavedMapping(account.importMapping)
  const preset = profileFor(account)
  const savedMapping = saved ? resolveSavedMapping(cells, saved) : null
  const profile: ProfileKey | 'saved' = savedMapping ? 'saved' : preset.key
  const mapping = savedMapping ?? resolveColumns(cells, preset)
  if (!mapping) return { ok: false, reason: 'UNKNOWN_FORMAT', sample }

  const rows = parseRows(cells, mapping)
  if (rows.length === 0) return { ok: false, reason: 'NO_ROWS', sample }
  return { ok: true, encoding, delimiter, profile, mapping, rows }
}
