import { describe, it, expect } from 'vitest'
import type { TFunction } from 'i18next'
import en from '../i18n/en.json'
import el from '../i18n/el.json'
import { buildBudgetWorksheet, monthLabel, worksheetFileName, WORKSHEET_EXPENSES, WORKSHEET_INCOME } from './budget-worksheet'
import { reportDocumentSchema } from '../../../shared/report-document'

const t = ((key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${Object.values(opts).join(',')}` : key)) as unknown as TFunction
const october = new Date(2026, 9, 1)

describe('buildBudgetWorksheet', () => {
  const doc = buildBudgetWorksheet(t, october, 'en', new Date(2026, 9, 26))

  it('is a valid write-in report with income, expenses and a summary', () => {
    expect(reportDocumentSchema.safeParse(doc).success).toBe(true)
    expect(doc.writeIn).toBe(true)
    expect(doc.sections.map(s => s.heading)).toEqual(['worksheet.income', 'worksheet.expenses', 'worksheet.summary'])
    expect(doc.title).toBe('worksheet.title:October 2026')
  })

  it('lists every starter category, blank rows for the family own, then a bold total', () => {
    const expenses = doc.sections[1]
    expect(expenses.rows).toHaveLength(WORKSHEET_EXPENSES.length + 2 + 1)
    expect(expenses.rows.at(-1)).toMatchObject({ bold: true, cells: ['worksheet.total_expenses', '', '', ''] })
    expect(expenses.rows.at(-2)?.cells).toEqual(['', '', '', ''])
    expect(expenses.columns.slice(1).every(c => c.align === 'right')).toBe(true)
  })

  it('has every category label in both languages', () => {
    for (const lang of [en, el]) {
      for (const key of [...WORKSHEET_INCOME, ...WORKSHEET_EXPENSES]) {
        expect(lang.worksheet.categories[key]).toBeTruthy()
      }
    }
  })
})

describe('labels', () => {
  it('names the month in the sheet language, capitalised', () => {
    expect(monthLabel(october, 'en')).toBe('October 2026')
    expect(monthLabel(october, 'el')).toMatch(/^Οκτώβριος 2026$/)
  })

  it('suggests a sortable file name', () => {
    expect(worksheetFileName(october)).toBe('budget-worksheet-2026-10')
  })
})
