import { describe, expect, it } from 'vitest'
import { queryMatcher, rowComparator, rowTitleText, type SearchRow } from './transaction-search'

const row = (patch: Partial<SearchRow>): SearchRow => ({
  id: 'r', bookedAt: new Date('2026-10-05'), createdAt: new Date('2026-10-05T10:00:00Z'), amountCents: -1250,
  payee: null, description: '', note: null, transferId: null, accountName: 'Alpha', categoryName: null, transferAccountName: null,
  ...patch,
})

describe('queryMatcher', () => {
  it('should match Greek text whatever its case and accents', () => {
    const r = row({ description: 'POS ΣΟΥΠΕΡΜΑΡΚΕΤ ΚΗΦΙΣΙΑ' })
    expect(queryMatcher('σουπερ')(r)).toBe(true)
    expect(queryMatcher('Σούπερ')(r)).toBe(true)
    expect(queryMatcher('lidl')(r)).toBe(false)
  })

  it('should look in payee, note, category and account too', () => {
    expect(queryMatcher('δωρο')(row({ note: 'Δώρο γενεθλίων' }))).toBe(true)
    expect(queryMatcher('fuel')(row({ categoryName: 'Fuel' }))).toBe(true)
    expect(queryMatcher('alpha')(row({}))).toBe(true)
    expect(queryMatcher('cafe')(row({ payee: 'Café Nero' }))).toBe(true)
  })

  it('should find an amount typed either way, whatever its sign', () => {
    expect(queryMatcher('12,50')(row({}))).toBe(true)
    expect(queryMatcher('12.5')(row({}))).toBe(true)
    expect(queryMatcher('12,51')(row({}))).toBe(false)
    expect(queryMatcher('12,50')(row({ amountCents: 1250 }))).toBe(true)
  })
})

describe('rowComparator', () => {
  const lidl = row({ id: 'lidl', payee: 'Lidl', amountCents: -5000, categoryName: 'Σούπερ μάρκετ', bookedAt: new Date('2026-10-01') })
  const ab = row({ id: 'ab', description: 'ΑΒ ΒΑΣΙΛΟΠΟΥΛΟΣ', amountCents: -1000, bookedAt: new Date('2026-10-03') })
  const salary = row({ id: 'salary', payee: 'Acme', amountCents: 200000, categoryName: 'Μισθός', bookedAt: new Date('2026-10-02') })
  const transfer = row({ id: 'tr', transferId: 't', transferAccountName: 'Cash', amountCents: -2000, bookedAt: new Date('2026-10-04') })
  const ids = (key: 'date' | 'description' | 'category' | 'amount', direction: 'asc' | 'desc') =>
    [lidl, ab, salary, transfer].sort(rowComparator({ key, direction })).map(r => r.id)

  it('should sort by date and by amount both ways', () => {
    expect(ids('date', 'desc')).toEqual(['tr', 'ab', 'salary', 'lidl'])
    expect(ids('date', 'asc')).toEqual(['lidl', 'salary', 'ab', 'tr'])
    expect(ids('amount', 'asc')).toEqual(['lidl', 'tr', 'ab', 'salary'])
  })

  it('should sort by what the list calls a row, Greek before Latin as in Greek', () => {
    expect(rowTitleText(transfer)).toBe('Cash')
    expect(ids('description', 'asc')).toEqual(['ab', 'salary', 'tr', 'lidl'])
  })

  it('should keep transfers and rows to categorise last in either direction', () => {
    expect(ids('category', 'asc')).toEqual(['salary', 'lidl', 'tr', 'ab'])
    expect(ids('category', 'desc')).toEqual(['lidl', 'salary', 'tr', 'ab'])
  })

  it('should break ties newest first', () => {
    const older = row({ id: 'older', payee: 'Lidl', bookedAt: new Date('2026-09-01') })
    expect([older, lidl].sort(rowComparator({ key: 'description', direction: 'asc' })).map(r => r.id)).toEqual(['lidl', 'older'])
  })
})
