import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Banner, Button, MetaLine, PageHeader, Segmented, Spinner } from '../components/ui'
import { BudgetEmptyState } from '../components/budget/BudgetEmptyState'
import { PeriodBar } from '../components/reports/PeriodBar'
import { BalanceTab, CategoryTab, MemberTab, TrendTab, type ReportRowsFilter } from '../components/reports/ReportTabs'
import { ReportPreviewModal } from '../components/pdf/ReportPreviewModal'
import { REPORT_TABS, activeRange, useReportsStore, type ReportData, type ReportTab } from '../store/reports'
import { useLedgerStore } from '../store/ledger'
import { periodLabel, reportCsv, reportDocument, reportFileName, reportTables } from '../lib/report-documents'
import { ipcErrorMessage } from '../lib/ipc-errors'
import type { AppLanguage } from '../types'

export interface ReportsScreenProps {
  onOpenRows: (filter: ReportRowsFilter) => void
}

/** Looking back over a period: where the money went, month by month, who spent it, and the balances */
export function ReportsScreen({ onOpenRows }: ReportsScreenProps) {
  const { t, i18n } = useTranslation()
  const tab = useReportsStore(s => s.tab)
  const preset = useReportsStore(s => s.preset)
  const custom = useReportsStore(s => s.custom)
  const data = useReportsStore(s => s.data)
  const error = useReportsStore(s => s.error)
  const revision = useLedgerStore(s => s.revision)
  const [printing, setPrinting] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const range = activeRange({ preset, custom })

  // Reload on arrival and after any write elsewhere
  useEffect(() => {
    void useReportsStore.getState().load()
  }, [revision])

  const ready = data !== null && data.tab === tab && data.report.range.from === range.from && data.report.range.to === range.to
  const empty = ready && isEmpty(data)

  async function exportCsv() {
    if (!ready) return
    setExportError(null)
    setSaved(null)
    try {
      const result = await window.api.saveCsv(reportCsv(reportTables(data, t, i18n.language), i18n.language), reportFileName(tab, range), t('reports.export_csv_title'))
      if (result.success) setSaved(result.filePath)
    } catch (err) {
      setExportError(ipcErrorMessage(err, t))
    }
  }

  async function openSaved() {
    if (!saved) return
    try {
      await window.api.openFile(saved)
    } catch (err) {
      setExportError(ipcErrorMessage(err, t))
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('reports.title')}
        subtitle={<MetaLine parts={[periodLabel(range), t('reports.meta_transfers')]} />}
        actions={
          <>
            <Button icon="printer" disabled={!ready || empty} onClick={() => setPrinting(true)}>{t('reports.export_pdf')}</Button>
            <Button icon="download" disabled={!ready || empty} onClick={() => void exportCsv()}>{t('reports.export_csv')}</Button>
          </>
        }
      />

      <PeriodBar showCompare={tab === 'category' || tab === 'member'} />
      <div className="mb-4">
        <Segmented<ReportTab>
          label={t('reports.tabs_label')}
          value={tab}
          options={REPORT_TABS.map(id => ({ value: id, label: t(`reports.tab_${id}`) }))}
          onChange={id => useReportsStore.getState().setTab(id)}
        />
      </div>

      {saved && (
        <Banner tone="success" className="mb-4" action={<Button size="sm" icon="external-link" onClick={() => void openSaved()}>{t('reports.open_file')}</Button>}>
          {t('reports.csv_saved')}
        </Banner>
      )}
      {exportError && <Banner tone="warning" className="mb-4">{exportError}</Banner>}
      {error ? <Banner tone="warning" className="mb-4">{ipcErrorMessage(error, t)}</Banner> : null}
      {!ready && !error && <div className="flex justify-center py-12"><Spinner /></div>}

      {ready && (empty ? (
        <BudgetEmptyState
          title={t('reports.empty_title')}
          body={t('reports.empty_body', { period: periodLabel(range) })}
          actions={
            <>
              <Button variant="primary" onClick={() => useReportsStore.getState().setPreset('THIS_YEAR')}>{t('reports.preset_THIS_YEAR')}</Button>
              <Button onClick={() => useReportsStore.getState().setPreset('LAST_12')}>{t('reports.preset_LAST_12')}</Button>
            </>
          }
        />
      ) : (
        <ReportBody data={data} onOpen={onOpenRows} />
      ))}

      {printing && ready && <ReportPrintModal data={data} onClose={() => setPrinting(false)} />}
    </div>
  )
}

/** Nothing booked in the period for this tab */
function isEmpty(data: ReportData): boolean {
  switch (data.tab) {
    case 'category': return data.report.rows.length === 0
    case 'trend': return data.report.rows.every(r => r.count === 0)
    case 'member': return data.report.rows.length === 0
    case 'balance': return data.report.accounts.length === 0
  }
}

function ReportBody({ data, onOpen }: { data: ReportData; onOpen: (filter: ReportRowsFilter) => void }) {
  switch (data.tab) {
    case 'category': return <CategoryTab report={data.report} onOpen={onOpen} />
    case 'trend': return <TrendTab report={data.report} onOpen={onOpen} />
    case 'member': return <MemberTab report={data.report} onOpen={onOpen} />
    case 'balance': return <BalanceTab report={data.report} />
  }
}

function ReportPrintModal({ data, onClose }: { data: ReportData; onClose: () => void }) {
  const { t } = useTranslation()
  const build = useCallback((sheetT: TFunction, lang: AppLanguage) => reportDocument(reportTables(data, sheetT, lang), sheetT), [data])
  return <ReportPreviewModal title={t('reports.print_title')} build={build} fileName={reportFileName(data.tab, data.report.range)} onClose={onClose} />
}
