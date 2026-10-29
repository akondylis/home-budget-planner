import { describe, expect, it } from 'vitest'
import {
  applyToSamePayee,
  filterRows,
  guessHeaderRow,
  headerOptions,
  initialChoices,
  missingFields,
  offersRule,
  reviewCounts,
  sortRows,
  toColumnMapping,
  toDecisions,
  type MappingForm,
} from './import-review'
import { merchantText, payeeKey } from '../../../shared/payee-key'
import type { PreviewRow } from '../../../shared/statement-import'

let nextLine = 2
function row(patch: Partial<PreviewRow>): PreviewRow {
  return {
    line: nextLine++,
    status: 'NEW',
    bookedAt: '2026-10-01',
    valueDate: null,
    amountCents: -1000,
    description: 'SHOP',
    bankReference: null,
    payeeKey: 'shop',
    balanceAfterCents: null,
    fingerprint: 'f',
    suggestion: null,
    duplicateOf: null,
    transferWith: null,
    transferHint: null,
    ...patch,
  }
}

const rule = (categoryId: string) => ({ categoryId, payee: null, source: { kind: 'rule' as const, ruleId: 'r', pattern: 'x' } })

describe('import review', () => {
  const fresh = row({ suggestion: rule('groceries') })
  const unsorted = row({})
  const known = row({ status: 'ALREADY_IMPORTED' })
  const twin = row({ status: 'POSSIBLE_DUPLICATE', duplicateOf: { id: 'h', bookedAt: '2026-09-30', amountCents: -1000, payee: 'Shop' } })
  const pair = row({ status: 'TRANSFER_MATCH', transferWith: { id: 'o', accountId: 'card', accountName: 'Card', bookedAt: '2026-10-02' } })
  const atm = row({ transferHint: 'ATM', description: 'ΑΝΑΛΗΨΗ ATM' })
  const broken = row({ status: 'INVALID', problem: 'DATE', bookedAt: null })
  const rows = [fresh, unsorted, known, twin, pair, atm, broken]

  it('should start with new rows in, transfers paired, twins out and an ATM withdrawal to Cash', () => {
    const choices = initialChoices(rows, 'cash')
    expect(toDecisions(rows, choices)).toEqual([
      { line: fresh.line, action: 'IMPORT', categoryId: 'groceries' },
      { line: unsorted.line, action: 'IMPORT', categoryId: null },
      { line: known.line, action: 'SKIP' },
      { line: twin.line, action: 'SKIP' },
      { line: pair.line, action: 'TRANSFER' },
      { line: atm.line, action: 'TRANSFER', toAccountId: 'cash' },
      { line: broken.line, action: 'SKIP' },
    ])
    expect(reviewCounts(rows, choices)).toEqual({ included: 4, toCategorise: 1 })
  })

  it('should leave an ATM withdrawal to categorise when there is no Cash account', () => {
    const choices = initialChoices([atm], null)
    expect(toDecisions([atm], choices)).toEqual([{ line: atm.line, action: 'IMPORT', categoryId: null }])
  })

  it('should link a ticked twin, and never send unreadable or known rows', () => {
    const choices = initialChoices(rows, null)
    choices[twin.line] = { ...choices[twin.line], include: true }
    choices[known.line] = { ...choices[known.line], include: true }
    const decisions = toDecisions(rows, choices)
    expect(decisions.find(d => d.line === twin.line)).toEqual({ line: twin.line, action: 'LINK' })
    expect(decisions.find(d => d.line === known.line)?.action).toBe('SKIP')
  })

  it('should filter by status and by rows still to categorise', () => {
    const choices = initialChoices(rows, 'cash')
    expect(filterRows(rows, choices, 'POSSIBLE_DUPLICATE')).toEqual([twin])
    expect(filterRows(rows, choices, 'TO_CATEGORISE')).toEqual([unsorted])
    expect(filterRows(rows, choices, 'ALL')).toHaveLength(rows.length)
  })

  it('should give a new rule to the same merchant, but not to rows sorted by hand or by another rule', () => {
    const a = row({ payeeKey: 'kritikos' })
    const b = row({ payeeKey: 'kritikos' })
    const byHand = row({ payeeKey: 'kritikos' })
    const byRule = row({ payeeKey: 'kritikos', suggestion: rule('eating-out') })
    const other = row({ payeeKey: 'lidl' })
    const list = [a, b, byHand, byRule, other]
    const choices = initialChoices(list, null)
    choices[byHand.line] = { include: true, target: { kind: 'category', categoryId: 'kids' } }
    const { choices: next, changed } = applyToSamePayee(list, choices, 'kritikos', 'groceries', new Set([a.line, byHand.line]))
    expect(changed).toBe(1)
    expect(next[b.line].target).toEqual({ kind: 'category', categoryId: 'groceries' })
    expect(next[byHand.line].target).toEqual({ kind: 'category', categoryId: 'kids' })
    expect(next[byRule.line].target).toEqual({ kind: 'category', categoryId: 'eating-out' })
    expect(next[other.line].target).toEqual({ kind: 'category', categoryId: null })
  })

  it('should offer a rule only when none already puts the row there', () => {
    expect(offersRule(fresh, 'groceries')).toBe(false)
    expect(offersRule(fresh, 'kids')).toBe(true)
    expect(offersRule(row({ payeeKey: '' }), 'kids')).toBe(false)
  })

  it('should show the merchant as the bank wrote it, folding to the same key', () => {
    expect(merchantText('POS ΒΑΣΙΛΟΠΟΥΛΟΣ ΚΗΦΙΣΙΑ 4411')).toBe('ΒΑΣΙΛΟΠΟΥΛΟΣ ΚΗΦΙΣΙΑ')
    expect(payeeKey(merchantText('ΑΓΟΡΑ LIDL XXXX1234'))).toBe(payeeKey('ΑΓΟΡΑ LIDL XXXX1234'))
  })
})

describe('column mapping', () => {
  const sample = [['Alpha Bank'], ['IBAN', 'GR00'], ['When', 'What', 'Out', 'In', ''], ['03/10/2026', 'Bakery', '4,50', '']]
  const form: MappingForm = {
    date: 'When', description: 'What', amountMode: 'DEBIT_CREDIT_COLUMNS', amount: '', debit: 'Out', credit: '',
    balance: '', dateOrder: 'DMY', decimalSeparator: ',', invertSign: false,
  }

  it('should guess the column names row and offer only usable names', () => {
    expect(guessHeaderRow(sample)).toBe(2)
    expect(headerOptions(['A', '', 'B', 'A'])).toEqual(['B'])
  })

  it('should ask for the date, description and an amount column', () => {
    expect(missingFields(form)).toEqual([])
    expect(missingFields({ ...form, date: '', debit: '' })).toEqual(['date', 'debit', 'credit'])
    expect(missingFields({ ...form, amountMode: 'SIGNED' })).toEqual(['amount'])
  })

  it('should build the mapping the account keeps', () => {
    expect(toColumnMapping({ ...form, balance: 'Balance' })).toEqual({
      columns: { date: 'When', description: 'What', debit: 'Out', balance: 'Balance' },
      dateOrder: 'DMY', decimalSeparator: ',', amountMode: 'DEBIT_CREDIT_COLUMNS', invertSign: false, debitFlags: [],
    })
  })
})

describe('sortRows', () => {
  const a = row({ bookedAt: '2026-10-03', description: 'ΣΚΛΑΒΕΝΙΤΗΣ 12', amountCents: -500 })
  const b = row({ bookedAt: null, description: 'Αβ Βασιλόπουλος', amountCents: null })
  const c = row({ bookedAt: '2026-10-01', description: 'Σκλαβενίτης 12', amountCents: 2000 })
  const rows = [a, b, c]
  const lines = (list: PreviewRow[]) => list.map(r => r.line)

  it('keeps statement order without a sort', () => {
    expect(sortRows(rows, null, 'el')).toBe(rows)
  })

  it('sorts by date both ways, rows without a date last', () => {
    expect(lines(sortRows(rows, { key: 'date', direction: 'asc' }, 'el'))).toEqual(lines([c, a, b]))
    expect(lines(sortRows(rows, { key: 'date', direction: 'desc' }, 'el'))).toEqual(lines([a, c, b]))
  })

  it('sorts descriptions ignoring Greek case and accents, ties in statement order', () => {
    expect(lines(sortRows(rows, { key: 'description', direction: 'asc' }, 'el'))).toEqual(lines([b, a, c]))
    expect(lines(sortRows(rows, { key: 'description', direction: 'desc' }, 'el'))).toEqual(lines([a, c, b]))
  })

  it('sorts by amount both ways, rows without an amount last', () => {
    expect(lines(sortRows(rows, { key: 'amount', direction: 'asc' }, 'el'))).toEqual(lines([a, c, b]))
    expect(lines(sortRows(rows, { key: 'amount', direction: 'desc' }, 'el'))).toEqual(lines([c, a, b]))
  })
})
