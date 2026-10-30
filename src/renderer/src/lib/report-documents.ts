// Reports export: each tab as plain tables, written out as a PDF (ReportDocument, through the
// preview) or as CSV for Excel. Cells are typed so each target formats money its own way.

import type { TFunction } from 'i18next'
import { formatMoney } from '../../../shared/money'
import { HOUSEHOLD } from '../../../shared/members'
import { csvMoney, sharePercent, toCsv, type DateRange } from '../../../shared/reports'
import type { ReportDocument } from '../../../shared/report-document'
import type { ReportData, ReportTab } from '../store/reports'
import { formatDate } from './date-format'
import { monthLabel } from './budget-worksheet'
import { monthDate } from './budget'

type Cell = string | { cents: number } | { percent: number }
interface Table {
  heading?: string
  columns: Array<{ header: string; width: number; align?: 'left' | 'right' }>
  rows: Array<{ cells: Cell[]; bold?: boolean }>
}
export interface ReportTables {
  title: string
  range: DateRange
  tables: Table[]
}

const money = (cents: number): Cell => ({ cents })
const pct = (percent: number): Cell => ({ percent })
const right = (header: string, width = 16) => ({ header, width, align: 'right' as const })

const periodName = (key: string, lang: string) => (key.includes('Q') ? key.split('-').reverse().join(' ') : monthLabel(monthDate(key), lang))

/** The tables behind the tab on screen; `t` may be fixed to another language than the app's */
export function reportTables(data: ReportData, t: TFunction, lang: string): ReportTables {
  switch (data.tab) {
    case 'category': {
      const r = data.report
      const income = r.direction === 'IN'
      return {
        title: t(income ? 'reports.pdf_title_category_in' : 'reports.pdf_title_category'),
        range: r.range,
        tables: [{
          columns: [
            { header: t(r.level === 'GROUP' ? 'reports.col_group' : 'reports.col_category'), width: 40 },
            right(t(income ? 'reports.col_received' : 'reports.col_spent'), 20),
            right(t('reports.col_share'), 12),
            ...(r.compare ? [right(t('reports.col_compared'), 20)] : []),
          ],
          rows: [
            ...r.rows.map(row => ({
              cells: [
                row.id === null ? t('reports.no_category') : row.groupName ? `${row.name} (${row.groupName})` : row.name,
                money(row.cents),
                pct(sharePercent(row.cents, r.totalCents)),
                ...(r.compare ? [money(row.compareCents ?? 0)] : []),
              ],
            })),
            { cells: [t('reports.total'), money(r.totalCents), pct(100), ...(r.compare ? [money(r.compareTotalCents ?? 0)] : [])], bold: true },
          ],
        }],
      }
    }
    case 'trend': {
      const r = data.report
      const sum = (pick: (row: (typeof r.rows)[number]) => number) => r.rows.reduce((s, row) => s + pick(row), 0)
      return {
        title: t('reports.pdf_title_trend'),
        range: r.range,
        tables: [{
          columns: [
            { header: t(r.by === 'QUARTER' ? 'reports.col_quarter' : 'reports.col_month'), width: 32 },
            right(t('reports.col_in'), 18),
            right(t('reports.col_out'), 18),
            right(t('reports.col_net'), 18),
            right(t('reports.col_rows'), 12),
          ],
          rows: [
            ...r.rows.map(row => ({ cells: [periodName(row.key, lang), money(row.inCents), money(0 - row.outCents), money(row.netCents), String(row.count)] })),
            { cells: [t('reports.total'), money(sum(x => x.inCents)), money(0 - sum(x => x.outCents)), money(sum(x => x.netCents)), String(sum(x => x.count))], bold: true },
          ],
        }],
      }
    }
    case 'member': {
      const r = data.report
      const rows: Table['rows'] = []
      for (const m of r.rows) {
        rows.push({
          cells: [m.id === HOUSEHOLD ? t('members.household') : (m.name ?? ''), money(m.cents), pct(sharePercent(m.cents, r.totalCents)), ...(r.compare ? [money(m.compareCents ?? 0)] : [])],
          bold: true,
        })
        for (const c of m.top) rows.push({ cells: [`    ${c.id === null ? t('reports.no_category') : c.name}`, money(c.cents), '', ...(r.compare ? [''] : [])] })
      }
      rows.push({ cells: [t('reports.total'), money(r.totalCents), pct(100), ...(r.compare ? [money(r.compareTotalCents ?? 0)] : [])], bold: true })
      return {
        title: t('reports.pdf_title_member'),
        range: r.range,
        tables: [{
          columns: [{ header: t('reports.col_member'), width: 40 }, right(t('reports.col_spent'), 20), right(t('reports.col_share'), 12), ...(r.compare ? [right(t('reports.col_compared'), 20)] : [])],
          rows,
        }],
      }
    }
    case 'balance': {
      const r = data.report
      const end = r.points.at(-1)?.cents ?? r.startCents
      const accountRow = (a: (typeof r.accounts)[number]) => ({ cells: [a.name, money(a.startCents), money(a.endCents), money(a.endCents - a.startCents)] })
      const vouchers = r.accounts.filter(a => !a.spendable)
      return {
        title: t('reports.pdf_title_balance'),
        range: r.range,
        tables: [
          {
            columns: [{ header: t('reports.col_account'), width: 40 }, right(t('reports.col_start'), 20), right(t('reports.col_end'), 20), right(t('reports.col_change'), 20)],
            rows: [
              ...r.accounts.filter(a => a.spendable).map(accountRow),
              { cells: [t('reports.balance_total'), money(r.startCents), money(end), money(end - r.startCents)], bold: true },
              ...(vouchers.length ? [{ cells: [t('reports.balance_vouchers'), '', '', ''], bold: true }, ...vouchers.map(accountRow)] : []),
            ],
          },
          {
            heading: t('reports.balance_title'),
            columns: [{ header: t('reports.col_month'), width: 60 }, right(t('reports.balance_total'), 40)],
            rows: r.points.map(p => ({ cells: [monthLabel(monthDate(p.month), lang), money(p.cents)] })),
          },
        ],
      }
    }
  }
}

const pdfCell = (c: Cell): string => (typeof c === 'string' ? c : 'cents' in c ? formatMoney(c.cents) : `${c.percent}%`)
const csvCell = (c: Cell, lang: string): string => (typeof c === 'string' ? c.trim() : 'cents' in c ? csvMoney(c.cents, lang) : String(c.percent))

export const periodLabel = (r: DateRange): string => `${formatDate(r.from)} – ${formatDate(r.to)}`

/** The tab as a printable document, previewed before export */
export function reportDocument(tables: ReportTables, t: TFunction, today = new Date()): ReportDocument {
  return {
    title: tables.title,
    subtitle: t('reports.pdf_subtitle', { period: periodLabel(tables.range), date: formatDate(today) }),
    orientation: 'portrait',
    writeIn: false,
    sections: tables.tables.map(table => ({
      heading: table.heading,
      columns: table.columns,
      rows: table.rows.map(r => ({ cells: r.cells.map(pdfCell), bold: r.bold })),
    })),
    footnote: t('reports.pdf_footnote'),
  }
}

/** The tab as CSV: a title line, the period, then each table with its header */
export function reportCsv(tables: ReportTables, lang: string): string {
  const lines: Array<Array<string | null>> = [[tables.title], [periodLabel(tables.range)]]
  for (const table of tables.tables) {
    lines.push([])
    if (table.heading) lines.push([table.heading])
    lines.push(table.columns.map(c => c.header))
    for (const r of table.rows) lines.push(r.cells.map(c => csvCell(c, lang)))
  }
  return toCsv(lines)
}

/** "reports-category-2026-01-01-2026-12-31" */
export const reportFileName = (tab: ReportTab, r: DateRange): string => `reports-${tab}-${r.from}-${r.to}`
