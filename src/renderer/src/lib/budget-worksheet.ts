// Printable monthly budget worksheet: the starter categories with Planned / Actual /
// Difference columns to fill in by hand (Overview, Ctrl+K), or the household's own
// categories filled from a month's budget (Budget page › Print).

import type { TFunction } from 'i18next'
import type { ReportDocument, ReportRow, ReportSection } from '../../../shared/report-document'
import { formatMoney } from '../../../shared/money'
import { isOutgoing, type BudgetGroupRow, type BudgetMonth, type BudgetYear, type YearGroupRow } from '../../../shared/budget'
import { formatDate } from './date-format'
import { shortMonthLabel } from './budget'

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

/** Year sheet amounts in whole euros, so 13 columns fit across the page */
const wholeMoney = (cents: number) => formatMoney(cents, { whole: true })
/** A month cell of the year sheet: blank for nothing, so the planned months stand out */
const yearCell = (cents: number) => (cents === 0 ? '' : wholeMoney(cents))

function yearSection(t: TFunction, heading: string, groups: YearGroupRow[], elapsed: number, totalLabel: string, lang: string): ReportSection {
  const rows: ReportRow[] = []
  const line = (label: string, months: number[], total: number, bold = false) => rows.push({ cells: [label, ...months.map(yearCell), wholeMoney(total)], bold })
  for (const g of groups) {
    const used = g.categories.filter(c => c.plannedCents !== 0 || c.actualCents !== 0)
    if (used.length === 0) continue
    line(g.name, g.months.map(m => m.plannedCents), g.plannedCents, true)
    for (const c of used) line(`    ${c.name}`, c.months.map(m => m.plannedCents), c.plannedCents)
    if (elapsed > 0) line(`    ${t('worksheet.year_actual')}`, g.months.map((m, i) => (i < elapsed ? m.actualCents : 0)), g.actualCents)
  }
  const sum = (i: number) => groups.reduce((total, g) => total + g.months[i].plannedCents, 0)
  line(totalLabel, Array.from({ length: 12 }, (_, i) => sum(i)), groups.reduce((total, g) => total + g.plannedCents, 0), true)
  return { heading, columns: yearColumns(t, lang), rows }
}

function yearColumns(t: TFunction, lang: string): ReportSection['columns'] {
  return [
    { header: t('worksheet.col_category'), width: 22 },
    ...Array.from({ length: 12 }, (_, i) => ({ header: shortMonthLabel(i, lang), width: 6, align: 'right' as const })),
    { header: t('worksheet.year_col_total'), width: 7, align: 'right' },
  ]
}

/** The year's plan month by month (with what was spent so far), for the Year view's Print: A4 landscape */
export function buildBudgetYearStatement(t: TFunction, budget: BudgetYear, lang: string, today = new Date()): ReportDocument {
  const income = budget.groups.filter(g => !isOutgoing(g.type))
  const out = budget.groups.filter(g => isOutgoing(g.type))
  const planned = (groups: YearGroupRow[], i: number) => groups.reduce((sum, g) => sum + g.months[i].plannedCents, 0)
  const months = Array.from({ length: 12 }, (_, i) => i)
  return {
    title: t('worksheet.year_title', { year: budget.year }),
    subtitle: t('worksheet.statement_subtitle', { date: formatDate(today) }),
    orientation: 'landscape',
    writeIn: false,
    sections: [
      yearSection(t, t('worksheet.income'), income, budget.elapsedMonths, t('worksheet.total_income'), lang),
      yearSection(t, t('worksheet.expenses'), out, budget.elapsedMonths, t('worksheet.total_expenses'), lang),
      {
        heading: t('worksheet.summary'),
        columns: yearColumns(t, lang),
        rows: [
          {
            cells: [t('worksheet.left_over'), ...months.map(i => wholeMoney(planned(income, i) - planned(out, i))), wholeMoney(budget.summary.leftToBudgetCents)],
            bold: true,
          },
        ],
      },
    ],
    footnote: t('worksheet.year_footnote'),
  }
}

/** File name without extension, e.g. "budget-worksheet-2026-10" */
export function worksheetFileName(month: Date): string {
  return `budget-worksheet-${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
}
