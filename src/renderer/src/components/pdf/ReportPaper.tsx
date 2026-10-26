import type { ReportDocument } from '../../../../shared/report-document'
import { cx } from '../ui/cx'

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const

export interface ReportPaperProps {
  report: ReportDocument
}

/**
 * On-screen copy of the PDF: same title, sections, columns and rows as
 * services/pdf/report-pdf.ts draws. Always light, like paper.
 */
export function ReportPaper({ report }: ReportPaperProps) {
  const portrait = (report.orientation ?? 'portrait') === 'portrait'
  return (
    <div
      className={cx(
        // Grows past one page instead of clipping; the PDF breaks pages itself
        'theme-light mx-auto w-full bg-surface p-10 text-fg shadow-md ring-1 ring-line',
        portrait ? 'max-w-[720px]' : 'max-w-[1080px]',
      )}
    >
      <h1 className="text-xl font-bold">{report.title}</h1>
      {report.subtitle && <p className="mt-1 text-xs text-gray-500">{report.subtitle}</p>}

      {report.sections.map((section, si) => {
        const total = section.columns.reduce((sum, c) => sum + c.width, 0)
        return (
          <section key={si} className="mt-5">
            {section.heading && <h2 className="mb-1 text-sm font-semibold">{section.heading}</h2>}
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                {section.columns.map((c, ci) => <col key={ci} style={{ width: `${(c.width / total) * 100}%` }} />)}
              </colgroup>
              <thead>
                <tr className="border-b border-gray-700">
                  {section.columns.map((c, ci) => (
                    <th key={ci} className={cx('py-1 font-semibold text-gray-500', ALIGN[c.align ?? 'left'])}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, ri) => (
                  <tr key={ri} className={cx(row.bold ? 'border-b border-gray-700 font-semibold' : report.writeIn && 'border-b border-gray-300')}>
                    {row.cells.map((cell, ci) => (
                      <td key={ci} className={cx('truncate', report.writeIn ? 'h-7' : 'py-1', ALIGN[section.columns[ci]?.align ?? 'left'])}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}

      {report.footnote && <p className="mt-4 text-[11px] text-gray-500">{report.footnote}</p>}
    </div>
  )
}
