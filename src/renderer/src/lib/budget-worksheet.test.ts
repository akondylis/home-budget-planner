import { describe, it, expect } from 'vitest'
import type { TFunction } from 'i18next'
import en from '../i18n/en.json'
import el from '../i18n/el.json'
import { buildBudgetStatement, buildBudgetWorksheet, buildBudgetYearStatement, monthLabel, worksheetFileName, WORKSHEET_EXPENSES, WORKSHEET_INCOME } from './budget-worksheet'
import { reportDocumentSchema } from '../../../shared/report-document'
import { budgetGroup, budgetRow, summariseBudget, summariseYear, yearGroup, yearRow, type BudgetMonth, type BudgetYear } from '../../../shared/budget'
import { setMoneyLanguage } from '../../../shared/money'

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

describe('buildBudgetStatement', () => {
  const row = (id: string, plannedCents: number, actualCents: number) =>
    budgetRow({ id, name: id, icon: null, archived: false, carryOver: false, plannedCents, carriedInCents: 0, actualCents, previousActualCents: 0, suggestedCents: 0 })
  const groups = [
    budgetGroup({ id: 'i', name: 'Income', type: 'INCOME', icon: null, categories: [row('Salary', 200_000, 200_000)] }),
    budgetGroup({ id: 'b', name: 'Bills', type: 'BILL', icon: null, categories: [row('Power', 10_000, 12_000), row('Unused', 0, 0)] }),
  ]
  const budget: BudgetMonth = {
    month: '2026-10', exists: true, updatedAt: null, summary: summariseBudget(groups), groups,
    unplannedCount: 0, unplannedCents: 0, uncategorisedCount: 0, previousHasPlan: false, previousHasActual: false,
  }

  it('fills the household categories with planned, actual and difference', () => {
    setMoneyLanguage('en')
    const doc = buildBudgetStatement(t, budget, october, 'en', new Date(2026, 9, 26))
    expect(reportDocumentSchema.safeParse(doc).success).toBe(true)
    expect(doc.writeIn).toBe(false)
    const expenses = doc.sections[1]
    expect(expenses.rows.map(r => r.cells[0].trim())).toEqual(['Bills', 'Power', 'worksheet.total_expenses'])
    expect(expenses.rows[1].cells).toEqual(['    Power', '€100.00', '€120.00', '-€20.00'])
    expect(doc.sections[2].rows[2].cells.slice(1, 3)).toEqual(['€1,900.00', '€1,880.00'])
  })
})

describe('buildBudgetYearStatement', () => {
  const twelve = (values: Record<number, number>) => Array.from({ length: 12 }, (_, i) => values[i] ?? 0)
  const row = (id: string, planned: number[], actual: number[]) =>
    yearRow({ id, name: id, icon: null, archived: false, carryOver: false, carries: false, carryInCents: 0, planned, actual, thisYearCents: 0, lastYearCents: 0, lastYearFullCents: 0, suggestedCents: 0 }, 10)
  const groups = [
    yearGroup({ id: 'i', name: 'Income', type: 'INCOME', icon: null, categories: [row('Salary', twelve({ 0: 200_000, 11: 200_000 }), twelve({ 0: 200_000 }))] }),
    yearGroup({ id: 'b', name: 'Bills', type: 'BILL', icon: null, categories: [row('Power', twelve({ 0: 10_000 }), twelve({ 0: 12_000, 11: 5_000 })), row('Unused', twelve({}), twelve({}))] }),
  ]
  const budget: BudgetYear = {
    year: 2026, elapsedMonths: 10, exists: true, updatedAt: null, summary: summariseYear(groups), groups, compare: null, latestPlannedMonth: '2026-12',
  }

  it('lays the year out on a landscape page, a column per month, the actual only for the months so far', () => {
    setMoneyLanguage('en')
    const doc = buildBudgetYearStatement(t, budget, 'en', new Date(2026, 9, 30))
    expect(reportDocumentSchema.safeParse(doc).success).toBe(true)
    expect(doc.orientation).toBe('landscape')
    const bills = doc.sections[1]
    expect(bills.columns.map(c => c.header).slice(0, 3)).toEqual(['worksheet.col_category', 'Jan', 'Feb'])
    expect(bills.rows.map(r => r.cells[0].trim())).toEqual(['Bills', 'Power', 'worksheet.year_actual', 'worksheet.total_expenses'])
    expect(bills.rows[1].cells.slice(0, 3)).toEqual(['    Power', '€100', ''])
    // December is still to come: its booked €50 is left out of the month, not the year total
    expect(bills.rows[2].cells[12]).toBe('')
    expect(bills.rows[2].cells[13]).toBe('€170')
    expect(doc.sections[2].rows[0].cells.slice(1, 2)).toEqual(['€1,900'])
  })
})
