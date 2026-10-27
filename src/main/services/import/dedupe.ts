// Duplicate protection, from exact to fuzzy (layers 2 and 3 of the import plan):
//  - same bank reference, or same fingerprint, as a row already in the account → ALREADY_IMPORTED
//  - a hand-entered row (no fingerprint) in the account with the same amount, ±3 days → POSSIBLE_DUPLICATE
// Layer 1 (same file again) is a banner, decided by the file hash; layer 4 is transfer-match.ts.

import type { RowStatus } from '../../../shared/statement-import'

export const TWIN_WINDOW_DAYS = 3

export interface DedupeRow {
  bookedAt: string | null
  amountCents: number | null
  bankReference: string | null
  fingerprint: string | null
  problem?: string
}

export interface ManualRow {
  id: string
  bookedAt: string
  amountCents: number
  payee: string | null
}

export interface ExistingRows {
  fingerprints: Set<string>
  bankReferences: Set<string>
  /** Rows of this account entered by hand (no fingerprint), not yet linked to a statement */
  manual: ManualRow[]
}

export interface DedupeResult {
  status: Exclude<RowStatus, 'TRANSFER_MATCH'>
  duplicateOf: ManualRow | null
}

/** Whole days between two 'yyyy-MM-dd' dates */
export function daysBetween(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)
}

/** One status per row, in file order. Each hand-entered row is offered as a twin at most once (nearest date first). */
export function classifyRows(rows: DedupeRow[], existing: ExistingRows): DedupeResult[] {
  const seenReferences = new Set<string>()
  const usedManual = new Set<string>()
  return rows.map(row => {
    if (row.problem || row.bookedAt === null || row.amountCents === null) return { status: 'INVALID', duplicateOf: null }
    if (row.bankReference) {
      // The reference is unique per account, inside the file too
      const known = existing.bankReferences.has(row.bankReference) || seenReferences.has(row.bankReference)
      seenReferences.add(row.bankReference)
      if (known) return { status: 'ALREADY_IMPORTED', duplicateOf: null }
    }
    if (row.fingerprint && existing.fingerprints.has(row.fingerprint)) return { status: 'ALREADY_IMPORTED', duplicateOf: null }

    const twin = existing.manual
      .filter(m => !usedManual.has(m.id) && m.amountCents === row.amountCents && daysBetween(m.bookedAt, row.bookedAt!) <= TWIN_WINDOW_DAYS)
      .sort((a, b) => daysBetween(a.bookedAt, row.bookedAt!) - daysBetween(b.bookedAt, row.bookedAt!))[0]
    if (twin) {
      usedManual.add(twin.id)
      return { status: 'POSSIBLE_DUPLICATE', duplicateOf: twin }
    }
    return { status: 'NEW', duplicateOf: null }
  })
}
