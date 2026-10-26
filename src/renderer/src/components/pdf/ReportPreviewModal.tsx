import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import i18next, { type TFunction } from 'i18next'
import { Banner, Button, Modal, Segmented } from '../ui'
import { ReportPaper } from './ReportPaper'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import type { AppLanguage } from '../../types'
import type { ReportDocument } from '../../../../shared/report-document'

export interface ReportPreviewModalProps {
  title: string
  /** Builds the report in the sheet's language (may differ from the app's) */
  build: (t: TFunction, lang: AppLanguage) => ReportDocument
  /** Suggested file name, without extension */
  fileName: string
  /** Extra footer controls left of the language switch (e.g. month) */
  options?: ReactNode
  onClose: () => void
}

type Outcome = { kind: 'saved'; filePath: string } | { kind: 'error'; message: string } | null

/** What will be printed, as it will look; Export PDF saves exactly this */
export function ReportPreviewModal({ title, build, fileName, options, onClose }: ReportPreviewModalProps) {
  const { t, i18n } = useTranslation()
  const [lang, setLang] = useState<AppLanguage>(i18n.language === 'en' ? 'en' : 'el')
  const [exporting, setExporting] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>(null)

  const report = useMemo(() => build(i18next.getFixedT(lang), lang), [build, lang])

  async function exportPdf() {
    setExporting(true)
    setOutcome(null)
    try {
      const result = await window.api.exportPdf(report, fileName, t('pdf.save_dialog_title'))
      if (result.success) setOutcome({ kind: 'saved', filePath: result.filePath })
    } catch (err) {
      setOutcome({ kind: 'error', message: ipcErrorMessage(err, t) })
    } finally {
      setExporting(false)
    }
  }

  async function openSaved(filePath: string) {
    try {
      await window.api.openFile(filePath)
    } catch (err) {
      setOutcome({ kind: 'error', message: ipcErrorMessage(err, t) })
    }
  }

  return (
    <Modal
      title={title}
      subtitle={t('pdf.preview_hint')}
      size="page"
      onClose={onClose}
      closeDisabled={exporting}
      bodyClassName="bg-gray-100 p-6"
      footer={
        <div className="flex w-full flex-wrap items-center gap-3">
          {options}
          <Segmented<AppLanguage>
            label={t('pdf.sheet_language')}
            value={lang}
            onChange={setLang}
            options={[
              { value: 'el', label: 'ΕΛ', title: 'Ελληνικά' },
              { value: 'en', label: 'EN', title: 'English' },
            ]}
          />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" icon="close" onClick={onClose} disabled={exporting}>{t('common.close')}</Button>
            <Button variant="primary" icon="download" onClick={exportPdf} loading={exporting}>
              {exporting ? t('pdf.exporting') : t('pdf.export')}
            </Button>
          </div>
        </div>
      }
    >
      {outcome?.kind === 'saved' && (
        <Banner
          tone="success"
          className="mx-auto mb-4 max-w-[720px]"
          action={<Button size="sm" icon="external-link" onClick={() => openSaved(outcome.filePath)}>{t('pdf.open')}</Button>}
        >
          <span className="break-all">{t('pdf.saved', { path: outcome.filePath })}</span>
        </Banner>
      )}
      {outcome?.kind === 'error' && (
        <Banner tone="warning" className="mx-auto mb-4 max-w-[720px]">{outcome.message}</Banner>
      )}
      <ReportPaper report={report} />
    </Modal>
  )
}
