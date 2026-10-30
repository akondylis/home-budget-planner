import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateInput, Segmented, SelectMenu } from '../ui'
import { useReportsStore } from '../../store/reports'
import { COMPARE_MODES, PERIOD_PRESETS, isRange, type CompareMode, type PeriodPreset } from '../../../../shared/reports'

/** One row: the period presets, the custom days and, where the tab uses it, what to compare with */
export function PeriodBar({ showCompare }: { showCompare: boolean }) {
  const { t } = useTranslation()
  const preset = useReportsStore(s => s.preset)
  const custom = useReportsStore(s => s.custom)
  const compare = useReportsStore(s => s.compare)
  // Typed days stay here until they make a valid range
  const [from, setFrom] = useState(custom.from)
  const [to, setTo] = useState(custom.to)
  useEffect(() => { setFrom(custom.from); setTo(custom.to) }, [custom])

  const backwards = from !== '' && to !== '' && from > to
  function change(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
    const range = { from: nextFrom, to: nextTo }
    if (isRange(range)) useReportsStore.getState().setCustom(range)
  }

  return (
    <div className="mb-4 flex flex-wrap items-start gap-3">
      <Segmented<PeriodPreset>
        label={t('reports.period_label')}
        value={preset}
        wrap
        options={PERIOD_PRESETS.map(p => ({ value: p, label: t(`reports.preset_${p}`) }))}
        onChange={p => useReportsStore.getState().setPreset(p)}
      />
      {preset === 'CUSTOM' && (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <label htmlFor="report-from" className="sr-only">{t('reports.custom_from')}</label>
            <DateInput id="report-from" value={from} invalid={backwards} onChange={v => change(v, to)} className="w-36" />
            <span className="text-sm text-fg-muted" aria-hidden="true">–</span>
            <label htmlFor="report-to" className="sr-only">{t('reports.custom_to')}</label>
            <DateInput id="report-to" value={to} invalid={backwards} onChange={v => change(from, v)} className="w-36" />
          </div>
          {backwards && <div role="alert" className="mt-1 text-xs text-red-700">{t('reports.custom_backwards')}</div>}
        </div>
      )}
      {showCompare && (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-fg-muted">{t('reports.compare_label')}</span>
          <SelectMenu<CompareMode>
            value={compare}
            ariaLabel={t('reports.compare_label')}
            options={COMPARE_MODES.map(c => ({ value: c, label: t(`reports.compare_${c}`) }))}
            onChange={c => useReportsStore.getState().setCompare(c)}
            triggerClassName="min-w-44"
          />
        </div>
      )}
    </div>
  )
}
