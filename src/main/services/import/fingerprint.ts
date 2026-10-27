// What makes a statement row the same row next time it is imported.
//
// fingerprint = sha256(account | date | cents | normalised description | n), where n
// counts the same key inside one file: two €2,50 coffees on one day are n=1 and n=2.
// An overlapping later file gives the same rows the same n, so they are found again;
// a third identical coffee in a new file is n=3 and counts as new.

import { createHash } from 'crypto'
import { normalise } from '../../../shared/search-normalise'

export { payeeKey } from '../../../shared/payee-key'

/** Description as matched by the fingerprint: accents and case folded, digits kept */
export function descriptionKey(description: string): string {
  return normalise(description)
}

export interface FingerprintInput {
  bookedAt: string
  amountCents: number
  description: string
}

/** Fingerprints for a file's rows in file order; null for rows without a date or amount */
export function fingerprintRows<T extends { bookedAt: string | null; amountCents: number | null; description: string }>(
  accountId: string,
  rows: T[],
): (string | null)[] {
  const seen = new Map<string, number>()
  return rows.map(row => {
    if (row.bookedAt === null || row.amountCents === null) return null
    const key = `${accountId}|${row.bookedAt}|${row.amountCents}|${descriptionKey(row.description)}`
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    return createHash('sha256').update(`${key}|${n}`).digest('hex')
  })
}

/** sha256 of the file bytes, to recognise the same file imported again */
export function fileHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
