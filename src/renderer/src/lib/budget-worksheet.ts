// Printable monthly budget worksheet: the starter categories with Planned / Actual /
// Difference columns to fill in by hand (Overview, Ctrl+K), or the household's own
// categories filled from a month's budget (Budget page › Print).

import type { TFunction } from 'i18next'
import type { ReportDocument, ReportRow, ReportSection } from '../../../shared/report-document'
import { formatMoney } from '../../../shared/money'
import { isOutgoing, type BudgetGroupRow, type BudgetMonth } from '../../../shared/budget'
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

const money = (cents: number) => formatMoney(cents)

/** Planned (with any carry) · actual · difference = planned − actual */
const figures = (available: number, actual: number) => [money(available), money(actual), money(available - actual)]

function filledSection(t: TFunction, heading: string, groups: BudgetGroupRow[], totalLabel: string): ReportSection {
  const rows: ReportRow[] = []
  for (const g of groups) {
    const used = g.categories.filter(c => c.availableCents !== 0 || c.actualCents !== 0)
    if (used.length === 0) continue
    rows.push({ cells: [g.name, ...figures(g.availableCents, g.actualCents)], bold: true })
    for (const c of used) rows.push({ cells: [`    ${c.name}`, ...figures(c.availableCents, c.actualCents)] })
  }
  const available = groups.reduce((sum, g) => sum + g.availableCents, 0)
  const actual = groups.reduce((sum, g) => sum + g.actualCents, 0)
  rows.push({ cells: [totalLabel, ...figures(available, actual)], bold: true })
  return { ...section(t, heading, [], totalLabel), rows }
}

/** The month's budget with its figures, for the Budget page's Print */
export function buildBudgetStatement(t: TFunction, budget: BudgetMonth, month: Date, lang: string, today = new Date()): ReportDocument {
  const income = budget.groups.filter(g => !isOutgoing(g.type))
  const out = budget.groups.filter(g => isOutgoing(g.type))
  const s = budget.summary
  const blank = buildBudgetWorksheet(t, month, lang, today)
  return {
    ...blank,
    subtitle: t('worksheet.statement_subtitle', { date: formatDate(today) }),
    writeIn: false,
    sections: [
      filledSection(t, t('worksheet.income'), income, t('worksheet.total_income')),
      filledSection(t, t('worksheet.expenses'), out, t('worksheet.total_expenses')),
      {
        ...blank.sections[2],
        rows: [
          { cells: [t('worksheet.total_income'), ...figures(s.plannedIncomeCents, s.actualIncomeCents)] },
          { cells: [t('worksheet.total_expenses'), ...figures(s.availableOutCents, s.actualOutCents)] },
          {
            cells: [
              t('worksheet.left_over'),
              money(s.plannedIncomeCents - s.availableOutCents),
              money(s.actualIncomeCents - s.actualOutCents),
              '',
            ],
            bold: true,
          },
        ],
      },
    ],
    footnote: t('worksheet.statement_footnote'),
  }
}

/** File name without extension, e.g. "budget-worksheet-2026-10" */
export function worksheetFileName(month: Date): string {
  return `budget-worksheet-${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
}
