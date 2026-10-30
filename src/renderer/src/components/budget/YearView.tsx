import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ActionMenu, Banner, Button, MetaLine, PageHeader, Segmented, Spinner } from '../ui'
import { isModalOpen } from '../ui/Modal'
import { usePrintShortcut } from '../../hooks/useShortcuts'
import { YearSwitcher } from './MonthSwitcher'
import { BudgetEmptyState } from './BudgetEmptyState'
import { BudgetSummaryTiles } from './BudgetSummaryTiles'
import { YearPlanGrid } from './YearPlanGrid'
import { YearCompareTable } from './YearCompareTable'
import { ReportPreviewModal } from '../pdf/ReportPreviewModal'
import { useBudgetStore, type BudgetView, type YearFill } from '../../store/budget'
import { useLedgerStore } from '../../store/ledger'
import { currentMonth } from '../../store/transactions'
import { buildBudgetYearStatement, monthLabel } from '../../lib/budget-worksheet'
import { monthDate, yearAsBudgetSummary } from '../../lib/budget'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { formatDate } from '../../lib/date-format'
import { fillMonths, type BudgetYear } from '../../../../shared/budget'
import type { AppLanguage } from '../../types'
import type { BudgetScreenProps } from '../../pages/BudgetScreen'

/** Month | Year on the Budget page's header */
export function BudgetViewToggle() {
  const { t } = useTranslation()
  const view = useBudgetStore(s => s.view)
  return (
    <Segmented<BudgetView>
      label={t('budget.view_label')}
      value={view}
      options={[
        { value: 'month', label: t('budget.view_month') },
        { value: 'year', label: t('budget.view_year') },
      ]}
      onChange={v => useBudgetStore.getState().setView(v)}
    />
  )
}

type YearTab = 'plan' | 'compare'

/** The year: 12 months of plans per category, and this year against last */
export function YearView({ onShowTransactions, onShowCategoryTransactions, onManageCategories }: BudgetScreenProps) {
  const { t, i18n } = useTranslation()
  const year = useBudgetStore(s => s.year)
  const data = useBudgetStore(s => s.yearData)
  const loadError = useBudgetStore(s => s.error)
  const revision = useLedgerStore(s => s.revision)
  const [tab, setTab] = useState<YearTab>('plan')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  // "Start blank" shows the empty grid for this year only
  const [blankYear, setBlankYear] = useState<number | null>(null)
  const thisMonth = currentMonth()
  const thisYear = Number(thisMonth.slice(0, 4))
  const month = (m: string) => monthLabel(monthDate(m), i18n.language)

  // Reload on arrival and after any write elsewhere
  useEffect(() => {
    void useBudgetStore.getState().loadYear()
  }, [revision])

  useEffect(() => {
    setNotice(null)
    setError(null)
  }, [year])

  // PageUp / PageDown move years, unless typing or a dialog is open
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.key !== 'PageUp' && e.key !== 'PageDown') || e.ctrlKey || e.altKey || isModalOpen()) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      useBudgetStore.getState().shiftYear(e.key === 'PageUp' ? -1 : 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const ready = data !== null && data.year === year
  const showTable = ready && data.groups.length > 0 && (data.exists || blankYear === year)
  usePrintShortcut(() => setPrinting(true), showTable)

  async function fill(key: string, input: YearFill) {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      const count = await useBudgetStore.getState().fillYear(input)
      const from = month(fillMonths(year, thisMonth)[0])
      setNotice(t(count > 0 ? 'budget.year_fill_done' : 'budget.year_fill_nothing', { count, from }))
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(null)
    }
  }

  const openMonth = (i: number) => {
    const store = useBudgetStore.getState()
    store.setMonth(`${year}-${String(i + 1).padStart(2, '0')}`)
    store.setView('month')
  }

  const latest = ready ? data.latestPlannedMonth : null
  const hasBills = ready && data.groups.some(g => g.categories.some(c => c.suggestedCents > 0))
  const fillPlan = () => {
    if (latest) void fill('MONTH', { source: 'MONTH', month: latest })
  }
  const fillBills = () => void fill('RULES', { source: 'RULES' })
  const plannedCount = ready ? data.groups.reduce((n, g) => n + g.categories.filter(c => c.plannedCents > 0).length, 0) : 0
  const tense = year < thisYear ? 'past' : year > thisYear ? 'future' : null

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t('budget.title')}
        subtitle={ready && (
          <MetaLine
            parts={[
              tense && t(`budget.year_tense_${tense}`),
              plannedCount > 0 && t('budget.meta_planned', { count: plannedCount }),
              data.updatedAt && t('budget.meta_updated', { date: formatDate(new Date(data.updatedAt)) }),
            ]}
          />
        )}
        actions={
          <>
            <BudgetViewToggle />
            <YearSwitcher
              year={year}
              current={thisYear}
              onChange={delta => useBudgetStore.getState().shiftYear(delta)}
              onToday={() => useBudgetStore.getState().setYear(thisYear)}
            />
            {showTable && (
              <>
                <Button icon="printer" onClick={() => setPrinting(true)}>{t('budget.print')}</Button>
                <ActionMenu
                  size="md"
                  label={t('budget.more')}
                  items={[
                    {
                      id: 'fill-plan',
                      label: latest ? t('budget.year_fill_plan', { month: month(latest) }) : t('budget.year_fill_plan_none'),
                      icon: 'copy',
                      disabled: !latest || busy !== null,
                      reason: latest ? undefined : t('budget.year_no_plan_yet'),
                      onSelect: fillPlan,
                    },
                    {
                      id: 'fill-rules',
                      label: t('budget.year_fill_rules'),
                      icon: 'repeat',
                      disabled: !hasBills || busy !== null,
                      reason: hasBills ? undefined : t('budget.no_rules'),
                      onSelect: fillBills,
                    },
                  ]}
                />
              </>
            )}
          </>
        }
      />

      {loadError ? <Banner tone="warning">{ipcErrorMessage(loadError, t)}</Banner> : null}
      {!ready && !loadError && <div className="flex justify-center py-12"><Spinner /></div>}

      {ready && (
        <>
          {error && <Banner tone="warning" className="mb-4">{error}</Banner>}
          {notice && <Banner tone="success" className="mb-4">{notice}</Banner>}

          {data.groups.length === 0 ? (
            <BudgetEmptyState
              title={t('budget.no_categories_title')}
              body={t('budget.no_categories_body')}
              actions={<Button variant="primary" icon="tag" onClick={onManageCategories}>{t('categories.title')}</Button>}
            />
          ) : !showTable ? (
            <BudgetEmptyState
              title={t('budget.year_empty_title', { year })}
              body={t('budget.year_empty_body', { from: month(fillMonths(year, thisMonth)[0]) })}
              actions={[
                latest !== null && { key: 'MONTH', icon: 'copy' as const, label: t('budget.year_copy_plan', { month: month(latest) }), run: fillPlan },
                hasBills && { key: 'RULES', icon: 'repeat' as const, label: t('budget.from_bills'), run: fillBills },
                { key: 'blank', icon: 'pencil' as const, label: t('budget.start_blank'), run: () => setBlankYear(year) },
              ]
                .filter(o => o !== false)
                .map((o, i) => (
                  <Button key={o.key} variant={i === 0 ? 'primary' : 'secondary'} icon={o.icon} loading={busy === o.key} disabled={busy !== null} onClick={o.run}>
                    {o.label}
                  </Button>
                ))}
            />
          ) : (
            <>
              <BudgetSummaryTiles summary={yearAsBudgetSummary(data.summary)} future={data.elapsedMonths === 0} period="year" />
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <Segmented<YearTab>
                  label={t('budget.year_tab_label')}
                  value={tab === 'compare' && !data.compare ? 'plan' : tab}
                  options={[
                    { value: 'plan', label: t('budget.year_tab_plan'), icon: 'target' },
                    {
                      value: 'compare',
                      label: t('budget.year_tab_compare'),
                      icon: 'trending-up',
                      disabled: !data.compare,
                      title: data.compare ? undefined : t('budget.year_compare_future'),
                    },
                  ]}
                  onChange={setTab}
                />
                {tab === 'compare' && data.compare && (
                  <span className="text-sm text-fg-muted">
                    {t('budget.year_compare_dates', {
                      from: formatDate(new Date(`${data.compare.from}T12:00:00`)),
                      to: formatDate(new Date(`${data.compare.to}T12:00:00`)),
                      lastFrom: formatDate(new Date(`${data.compare.lastFrom}T12:00:00`)),
                      lastTo: formatDate(new Date(`${data.compare.lastTo}T12:00:00`)),
                    })}
                  </span>
                )}
              </div>
              {tab === 'compare' && data.compare ? (
                data.compare.hasLastYear
                  ? <YearCompareTable data={data} />
                  : <Banner tone="info">{t('budget.year_compare_none', { year: year - 1 })}</Banner>
              ) : (
                <YearPlanGrid
                  data={data}
                  currentIndex={year === thisYear ? Number(thisMonth.slice(5)) - 1 : null}
                  onSetPlanned={(i, categoryId, cents) => useBudgetStore.getState().setYearPlanned(i, categoryId, cents)}
                  onOpenMonth={openMonth}
                  onShowMonthTransactions={(i, categoryId) => onShowTransactions(`${year}-${String(i + 1).padStart(2, '0')}`, categoryId)}
                  onShowTransactions={onShowCategoryTransactions}
                  onFillRow={(categoryId, cents) => void fill(`row-${categoryId}`, { source: 'AMOUNT', categoryId, cents })}
                  onSetCarryOver={(categoryId, carryOver) =>
                    void useBudgetStore.getState().setCarryOver(categoryId, carryOver)
                      .then(() => useBudgetStore.getState().loadYear())
                      .catch(err => setError(ipcErrorMessage(err, t)))}
                />
              )}
            </>
          )}
        </>
      )}

      {printing && ready && <YearPrintModal data={data} onClose={() => setPrinting(false)} />}
    </div>
  )
}

function YearPrintModal({ data, onClose }: { data: BudgetYear; onClose: () => void }) {
  const { t } = useTranslation()
  const build = useCallback((sheetT: TFunction, lang: AppLanguage) => buildBudgetYearStatement(sheetT, data, lang), [data])
  return <ReportPreviewModal title={t('budget.year_print_title')} build={build} fileName={`budget-${data.year}`} onClose={onClose} />
}
