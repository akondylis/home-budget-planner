// Search and text sorts of the log, done in memory: SQLite LIKE folds only ASCII
// case, and Greek statements are uppercase without accents.

import { normalise } from '../../shared/search-normalise'
import { parseMoney } from '../../shared/money'
import type { LogSort } from '../../shared/ledger'

/** The fields of a row that search and sorting look at */
export interface SearchRow {
  id: string
  bookedAt: Date
  createdAt: Date
  amountCents: number
  payee: string | null
  description: string
  note: string | null
  transferId: string | null
  accountName: string
  categoryName: string | null
  /** The other account of a transfer */
  transferAccountName: string | null
}

/** What the list calls a row (mirrors the renderer's rowTitle, without i18n) */
export function rowTitleText(row: SearchRow): string {
  if (row.transferId) return row.transferAccountName ?? ''
  return row.payee || row.description || row.categoryName || ''
}

/** A matcher for the typed query: text anywhere in the row, or the amount itself ("12,50") */
export function queryMatcher(query: string): (row: SearchRow) => boolean {
  const text = normalise(query)
  const cents = parseMoney(query)
  return row => {
    if (cents !== null && cents !== 0 && Math.abs(row.amountCents) === Math.abs(cents)) return true
    if (!text) return false
    const haystack = normalise([row.payee, row.description, row.note, row.categoryName, row.accountName, row.transferAccountName].filter(Boolean).join(' '))
    return haystack.includes(text)
  }
}

const collator = new Intl.Collator('el', { sensitivity: 'base', numeric: true })

/** Newest first: the tie-break of every sort */
function newestFirst(a: SearchRow, b: SearchRow): number {
  return b.bookedAt.getTime() - a.bookedAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime()
}

/** Comparator for a column; ties go newest first */
export function rowComparator(sort: LogSort): (a: SearchRow, b: SearchRow) => number {
  const sign = sort.direction === 'asc' ? 1 : -1
  return (a, b) => {
    let diff = 0
    if (sort.key === 'date') return sign * -newestFirst(a, b)
    if (sort.key === 'amount') diff = sign * (a.amountCents - b.amountCents)
    else if (sort.key === 'description') diff = sign * collator.compare(rowTitleText(a), rowTitleText(b))
    else diff = categoryRank(a) - categoryRank(b) || sign * collator.compare(a.categoryName ?? '', b.categoryName ?? '')
    return diff || newestFirst(a, b)
  }
}

/** Categorised rows, then transfers, then rows still to categorise, whichever the direction */
function categoryRank(row: SearchRow): number {
  return row.categoryName !== null ? 0 : row.transferId ? 1 : 2
}
