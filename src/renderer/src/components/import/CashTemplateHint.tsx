import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui'
import { Icon } from '../shell/icons'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { CASH_TEMPLATE_HEADERS, cashTemplateCsv } from '../../../../shared/cash-template'
import { todayDateOnly } from '../../../../shared/date-only'

export interface CashTemplateHintProps {
  /** A save or open that failed, for the wizard's banner */
  onError: (message: string) => void
}

/** The file step for a Cash account: what goes in the template, an example, and the template itself */
export function CashTemplateHint({ onError }: CashTemplateHintProps) {
  const { t, i18n } = useTranslation()
  const [saved, setSaved] = useState<string | null>(null)
  const headers = i18n.language.startsWith('en') ? CASH_TEMPLATE_HEADERS.en : CASH_TEMPLATE_HEADERS.el
  // The file's own date format (dd/mm/yyyy), whatever the display format in Settings
  const [y, m, d] = todayDateOnly().split('-')
  const example = [
    [`${d}/${m}/${y}`, t('import.cash.example_expense'), '23,40', '', t('import.cash.example_expense_category')],
    [`${d}/${m}/${y}`, t('import.cash.example_income'), '', '50,00', ''],
  ]

  async function download() {
    try {
      const result = await window.api.saveCsv(cashTemplateCsv(i18n.language), t('import.cash.file_name'), t('import.cash.save_title'))
      if (result.success) setSaved(result.filePath)
    } catch (err) {
      onError(ipcErrorMessage(err, t))
    }
  }

  async function open() {
    if (!saved) return
    try {
      await window.api.openFile(saved)
    } catch (err) {
      onError(ipcErrorMessage(err, t))
    }
  }

  return (
    <section aria-labelledby="cash-template-title" className="space-y-3 rounded-lg border border-line bg-bg p-3">
      <div>
        <h3 id="cash-template-title" className="text-sm font-semibold text-fg">{t('import.cash.template_title')}</h3>
        <p className="mt-0.5 text-sm text-fg-muted">{t('import.cash.how_to')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" aria-label={t('import.cash.example')}>
          <thead>
            <tr className="text-left text-fg-muted">
              {headers.map((h, i) => (
                <th key={h} scope="col" className={`whitespace-nowrap px-2 py-1 font-medium ${i === 2 || i === 3 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {example.map((row, r) => (
              <tr key={r} className="border-t border-line text-fg">
                {row.map((cell, i) => (
                  <td key={i} className={`whitespace-nowrap px-2 py-1 ${i === 2 || i === 3 ? 'text-right tabular-nums' : ''} ${cell === '' ? 'text-fg-muted' : ''}`}>
                    {cell === '' ? '—' : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button size="sm" icon="download" onClick={() => void download()}>{t('import.cash.download')}</Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-fg-muted" role="status">
            <Icon name="check" size={14} className="shrink-0 text-success-fg" />
            {t('import.cash.saved')}
            <button type="button" className="btn-link" onClick={() => void open()}>{t('import.cash.open')}</button>
          </span>
        )}
      </div>
    </section>
  )
}
