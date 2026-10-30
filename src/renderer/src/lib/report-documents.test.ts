import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { reportCsv, reportDocument, reportFileName, reportTables } from './report-documents'
import { reportDocumentSchema } from '../../../shared/report-document'
import { setMoneyLanguage } from '../../../shared/money'
import type { CategoryReport, MemberReport, TrendReport } from '../../../shared/reports'

const t = ((key: string) => key) as unknown as TFunction
const range = { from: '2026-01-01', to: '2026-12-31' }

const category: CategoryReport = {
  range,
  compare: { from: '2025-01-01', to: '2025-12-31' },
  direction: 'OUT',
  level: 'CATEGORY',
  rows: [
    { id: 'food', name: 'Σούπερ μάρκετ', groupName: 'Διατροφή', cents: 300_050, compareCents: 250_000 },
    { id: null, name: '', groupName: null, cents: 2_000, compareCents: 0 },
  ],
  totalCents: 302_050,
  compareTotalCents: 250_000,
}

describe('report documents', () => {
  it('should make a valid printable document with a total row', () => {
    setMoneyLanguage('el')
    const doc = reportDocument(reportTables({ tab: 'category', report: category }, t, 'el'), t, new Date(2026, 9, 30))
    expect(reportDocumentSchema.safeParse(doc).success).toBe(true)
    const rows = doc.sections[0].rows
    expect(rows.map(r => r.cells[0])).toEqual(['Σούπερ μάρκετ (Διατροφή)', 'reports.no_category', 'reports.total'])
    expect(rows[2].bold).toBe(true)
    expect(doc.sections[0].columns).toHaveLength(4)
  })

  it('should write CSV amounts without currency in the language of the sheet', () => {
    const csv = reportCsv(reportTables({ tab: 'category', report: category }, t, 'el'), 'el')
    expect(csv).toContain('Σούπερ μάρκετ (Διατροφή);3000,50;99;2500,00')
    expect(reportCsv(reportTables({ tab: 'category', report: category }, t, 'en'), 'en')).toContain(';3000.50;')
  })

  it('should list a member with their top categories indented, and months by name', () => {
    const members: MemberReport = {
      range, compare: null, totalCents: 1_000, compareTotalCents: null,
      rows: [{ id: 'household', name: null, colour: null, cents: 1_000, compareCents: null, top: [{ id: 'food', name: 'Food', cents: 1_000 }] }],
    }
    const doc = reportDocument(reportTables({ tab: 'member', report: members }, t, 'en'), t)
    expect(doc.sections[0].rows.map(r => r.cells[0])).toEqual(['members.household', '    Food', 'reports.total'])

    const trend: TrendReport = { range, by: 'QUARTER', rows: [{ key: '2026-Q1', range, inCents: 10, outCents: 5, netCents: 5, count: 2 }] }
    expect(reportTables({ tab: 'trend', report: trend }, t, 'en').tables[0].rows[0].cells[0]).toBe('Q1 2026')
  })

  it('should name the file after the tab and the days', () => {
    expect(reportFileName('trend', range)).toBe('reports-trend-2026-01-01-2026-12-31')
  })
})
