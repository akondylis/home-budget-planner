import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Segmented } from '../ui'
import { ReportPreviewModal } from './ReportPreviewModal'
import { buildBudgetWorksheet, monthLabel, worksheetFileName } from '../../lib/budget-worksheet'
import type { AppLanguage } from '../../types'

type Which = 'this' | 'next'

function monthOf(which: Which, today = new Date()): Date {
  return new Date(today.getFullYear(), today.getMonth() + (which === 'next' ? 1 : 0), 1)
}

/** Overview / Ctrl+K: a blank monthly budget sheet to plan on paper */
export function WorksheetPreviewModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const [which, setWhich] = useState<Which>('this')
  const month = monthOf(which)

  const build = useCallback(
    (sheetT: TFunction, lang: AppLanguage) => buildBudgetWorksheet(sheetT, monthOf(which), lang),
    [which],
  )

  return (
    <ReportPreviewModal
      title={t('worksheet.preview_title')}
      build={build}
      fileName={worksheetFileName(month)}
      onClose={onClose}
      options={
        <Segmented<Which>
          label={t('worksheet.month')}
          value={which}
          onChange={setWhich}
          options={[
            { value: 'this', label: monthLabel(monthOf('this'), i18n.language) },
            { value: 'next', label: monthLabel(monthOf('next'), i18n.language) },
          ]}
        />
      }
    />
  )
}
