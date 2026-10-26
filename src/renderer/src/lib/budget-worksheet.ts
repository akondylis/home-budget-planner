// Printable monthly budget worksheet: the starter categories with Planned / Actual /
// Difference columns to fill in by hand. Becomes the real monthly statement once
// transactions and budgets exist (same ReportDocument, cells filled from data).

import type { TFunction } from 'i18next'
import type { ReportDocument, ReportSection } from '../../../shared/report-document'
import { formatDate } from './date-format'

export const WORKSHEET_INCOME = ['salary', 'other_income'] as const
export const WORKSHEET_EXPENSES = [
  'housing', 'utilities', 'groceries', 'transport', 'kids', 'health', 'insurance',
  'subscriptions', 'eating_out', 'leisure', 'clothing', 'gifts', 'savings', 'other',
] as const
/** Empty rows under each list for the family's own categories */
const BLANK_ROWS = 2

/** "October 2026" / "Οκτώβριος 2026" (nominative, as a heading) */
export function monthLabel(month: Date, lang: string): string {
  const label = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'el-GR', { month: 'long', year: 'numeric' }).format(month)
  return label.charAt(0).toLocaleUpperCase(lang) + label.slice(1)
}

function section(t: TFunction, heading: string, keys: readonly string[], totalLabel: string): ReportSection {
  return {
    heading,
    columns: [
      { header: t('worksheet.col_category'), width: 46 },
      { header: t('worksheet.col_planned'), width: 18, align: 'right' },
      { header: t('worksheet.col_actual'), width: 18, align: 'right' },
      { header: t('worksheet.col_difference'), width: 18, align: 'right' },
    ],
    rows: [
      ...keys.map(key => ({ cells: [t(`worksheet.categories.${key}`), '', '', ''] })),
      ...Array.from({ length: BLANK_ROWS }, () => ({ cells: ['', '', '', ''] })),
      { cells: [totalLabel, '', '', ''], bold: true },
    ],
  }
}

/** `t` is fixed to the sheet's language, which may differ from the app's */
export function buildBudgetWorksheet(t: TFunction, month: Date, lang: string, today = new Date()): ReportDocument {
  return {
    title: t('worksheet.title', { month: monthLabel(month, lang) }),
    subtitle: t('worksheet.subtitle', { date: formatDate(today) }),
    orientation: 'portrait',
    writeIn: true,
    sections: [
      section(t, t('worksheet.income'), WORKSHEET_INCOME, t('worksheet.total_income')),
      section(t, t('worksheet.expenses'), WORKSHEET_EXPENSES, t('worksheet.total_expenses')),
      {
        heading: t('worksheet.summary'),
        columns: [
          { header: '', width: 46 },
          { header: t('worksheet.col_planned'), width: 18, align: 'right' },
          { header: t('worksheet.col_actual'), width: 18, align: 'right' },
          { header: t('worksheet.col_difference'), width: 18, align: 'right' },
        ],
        rows: [
          { cells: [t('worksheet.total_income'), '', '', ''] },
          { cells: [t('worksheet.total_expenses'), '', '', ''] },
          { cells: [t('worksheet.left_over'), '', '', ''], bold: true },
        ],
      },
    ],
    footnote: t('worksheet.footnote'),
  }
}

/** File name without extension, e.g. "budget-worksheet-2026-10" */
export function worksheetFileName(month: Date): string {
  return `budget-worksheet-${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
}
