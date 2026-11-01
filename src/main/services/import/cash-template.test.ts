import { describe, expect, it } from 'vitest'
import { readStatement } from './read-statement'
import { profileFor } from './profiles'
import { buildPreview } from './build-preview'
import type { ParsedRow } from './parse-rows'
import { CASH_TEMPLATE_HEADERS, cashTemplateCsv } from '../../../shared/cash-template'
import { normalise } from '../../../shared/search-normalise'

const utf8 = (s: string) => new TextEncoder().encode(s)
const cash = { importProfile: null, importMapping: null, statementPreset: null, kind: 'CASH' as const }

/** The downloaded template with rows typed under it, as a spreadsheet saves it */
const filled = (lang: string, ...rows: string[]) => utf8(cashTemplateCsv(lang) + rows.join('\r\n'))

describe('cash template', () => {
  it('should be a header-only CSV with a BOM and ; in the app language', () => {
    expect(cashTemplateCsv('el')).toBe('﻿Ημερομηνία;Περιγραφή;Έξοδο;Έσοδο;Κατηγορία\r\n')
    expect(cashTemplateCsv('en')).toBe('﻿Date;Description;Expense;Income;Category\r\n')
  })

  it('should be the preset of a Cash account', () => {
    expect(profileFor(cash).key).toBe('cash-template')
  })

  it.each(['el', 'en'])('should read the filled-in %s template: expense out, income in, category kept', lang => {
    const result = readStatement(filled(lang, '01/11/2026;Λαϊκή;23,40;;Σούπερ μάρκετ', '02/11/2026;Gift;;50;', '03/11/2026;Nothing;;;'), cash)
    expect(result).toMatchObject({ ok: true, profile: 'cash-template' })
    if (!result.ok) return
    expect(result.rows).toEqual([
      expect.objectContaining({ bookedAt: '2026-11-01', description: 'Λαϊκή', amountCents: -2340, categoryText: 'Σούπερ μάρκετ' }),
      expect.objectContaining({ bookedAt: '2026-11-02', description: 'Gift', amountCents: 5000 }),
      expect.objectContaining({ line: 4, problem: 'AMOUNT' }),
    ])
    expect(result.rows[1].categoryText).toBeUndefined()
  })

  it('should read a template with its columns moved by their names (the category is then left out)', () => {
    const [date, description, expense, income] = CASH_TEMPLATE_HEADERS.en
    const result = readStatement(utf8(`${description};${income};${expense};${date}\nCoffee;;2,10;05/11/2026`), cash)
    expect(result).toMatchObject({ ok: true, rows: [{ bookedAt: '2026-11-05', description: 'Coffee', amountCents: -210 }] })
  })
})

describe('category named in the file', () => {
  const ctx = {
    fingerprints: new Set<string>(), bankReferences: new Set<string>(), manual: [], transferCandidates: [],
    rules: [{ id: 'r1', pattern: 'laiki', match: 'CONTAINS' as const, accountId: null, categoryId: 'eating-out', payee: null, priority: 0 }],
    history: new Map<string, string>(), ownIbans: new Map(),
    categoriesByName: {
      expense: new Map([[normalise('Σούπερ μάρκετ'), 'groceries']]),
      income: new Map([[normalise('Δώρα'), 'gifts']]),
    },
  }
  const row = (line: number, description: string, amountCents: number, categoryText?: string): ParsedRow => ({
    line, bookedAt: '2026-11-01', valueDate: null, amountCents, description, bankReference: null, balanceAfterCents: null, pending: false,
    ...(categoryText ? { categoryText } : {}),
  })

  it('should win over a rule when it names a category of the right direction, ignoring case and accents', () => {
    const { rows } = buildPreview('cash', [
      row(2, 'Λαϊκή', -2340, 'ΣΟΥΠΕΡ ΜΑΡΚΕΤ'),
      row(3, 'Gift', 5000, 'δωρα'),
      // An income category on money out is not a match: the rule's suggestion stays
      row(4, 'Λαϊκή', -1000, 'Δώρα'),
      row(5, 'Λαϊκή', -500, 'No such category'),
    ], ctx)
    expect(rows.map(r => r.suggestion && [r.suggestion.categoryId, r.suggestion.source.kind])).toEqual([
      ['groceries', 'file'],
      ['gifts', 'file'],
      ['eating-out', 'rule'],
      ['eating-out', 'rule'],
    ])
  })
})
