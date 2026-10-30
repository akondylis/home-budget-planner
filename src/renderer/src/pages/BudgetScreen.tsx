import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ActionMenu, Banner, Button, ConfirmDialog, MetaLine, PageHeader, Spinner } from '../components/ui'
import { isModalOpen } from '../components/ui/Modal'
import { usePrintShortcut } from '../hooks/useShortcuts'
import { MonthSwitcher } from '../components/budget/MonthSwitcher'
import { BudgetEmptyState } from '../components/budget/BudgetEmptyState'
import { BudgetViewToggle, YearView } from '../components/budget/YearView'
import { BudgetSummaryTiles } from '../components/budget/BudgetSummaryTiles'
import { BudgetTable, isUnplanned } from '../components/budget/BudgetTable'
import { ReportPreviewModal } from '../components/pdf/ReportPreviewModal'
import { useBudgetStore } from '../store/budget'
import { useLedgerStore } from '../store/ledger'
import { currentMonth } from '../store/transactions'
import { buildBudgetStatement, monthLabel } from '../lib/budget-worksheet'
import { monthDate, monthTense } from '../lib/budget'
import { ipcErrorMessage } from '../lib/ipc-errors'
import { formatDate } from '../lib/date-format'
import { formatMoney } from '../../../shared/money'
import { addMonths } from '../../../shared/date-only'
import type { BudgetMonth, CopySource } from '../../../shared/budget'
import type { AppLanguage } from '../types'

export interface BudgetScreenProps {
  onShowTransactions: (month: string, categoryId: string) => void
  /** The log on every row of one category (Year view) */
  onShowCategoryTransactions: (categoryId: string) => void
  onShowUncategorised: (month: string) => void
  onManageCategories: () => void
}

/** The Budget page: one month, or the whole year */
export function BudgetScreen(props: BudgetScreenProps) {
  const view = useBudgetStore(s => s.view)
  return view === 'year' ? <YearView {...props} /> : <MonthBudget {...props} />
}

/** Plan per category for a month, compared with what came in and went out */
function MonthBudget({ onShowTransactions, onShowUncategorised, onManageCategories }: BudgetScreenProps) {
  const { t, i18n } = useTranslation()
  const month = useBudgetStore(s => s.month)
  const data = useBudgetStore(s => s.data)
  const loadError = useBudgetStore(s => s.error)
  const revision = useLedgerStore(s => s.revision)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<CopySource | 'clear' | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [printing, setPrinting] = useState(false)
  // "Start blank" shows the empty table for this month only
  const [blankMonth, setBlankMonth] = useState<string | null>(null)
  const current = currentMonth()
  const label = monthLabel(monthDate(month), i18n.language)
  const previousLabel = monthLabel(monthDate(addMonths(month, -1)), i18n.language)
  const tense = monthTense(month, current)

  // Reload on arrival and after any write elsewhere (a categorised row changes the actuals)
  useEffect(() => {
    void useBudgetStore.getState().load()
  }, [revision])

  useEffect(() => {
    setNotice(null)
    setError(null)
  }, [month])

  // A copy started from Ctrl+K reports here
  const flash = useBudgetStore(s => s.flash)
  useEffect(() => {
    if (!flash) return
    if (flash.kind === 'copied') setNotice(t(flash.count > 0 ? 'budget.copy_done' : 'budget.copy_nothing', { count: flash.count, month: previousLabel }))
    else setError(ipcErrorMessage(flash.error, t))
    useBudgetStore.getState().setFlash(null)
  }, [flash, t, previousLabel])

  // PageUp / PageDown move months, unless typing or a dialog is open
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.key !== 'PageUp' && e.key !== 'PageDown') || e.ctrlKey || e.altKey || isModalOpen()) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      useBudgetStore.getState().shift(e.key === 'PageUp' ? -1 : 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  async function run(kind: CopySource | 'clear', write: () => Promise<string | null>) {
    setBusy(kind)
    setError(null)
    setNotice(null)
    try {
      setNotice(await write())
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(null)
    }
  }

  const copy = (source: CopySource) =>
    run(source, async () => {
      const count = await useBudgetStore.getState().copyFromPrevious(source)
      if (source === 'RULES') return t(count > 0 ? 'budget.rules_done' : 'budget.rules_nothing', { count })
      return t(count > 0 ? 'budget.copy_done' : 'budget.copy_nothing', { count, month: previousLabel })
    })

  const clear = () =>
    run('clear', async () => {
      await useBudgetStore.getState().clear()
      setConfirmClear(false)
      setBlankMonth(null)
      return null
    })

  const setCarryOver = (categoryId: string, carryOver: boolean) =>
    void useBudgetStore.getState().setCarryOver(categoryId, carryOver).catch(err => setError(ipcErrorMessage(err, t)))

  const ready = data !== null && data.month === month
  const hasBills = ready && data.groups.some(g => g.categories.some(c => c.suggestedCents > 0))
  const plannedCount = ready ? data.groups.reduce((n, g) => n + g.categories.filter(c => c.plannedCents > 0).length, 0) : 0
  const showTable = ready && data.groups.length > 0 && (data.exists || blankMonth === month)
  // Ctrl+P prints this month's budget while the table is showing
  usePrintShortcut(() => setPrinting(true), showTable)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('budget.title')}
        subtitle={ready && (
          <MetaLine
            parts={[
              tense !== 'current' && t(`budget.tense_${tense}`),
              plannedCount > 0 && t('budget.meta_planned', { count: plannedCount }),
              data.updatedAt && t('budget.meta_updated', { date: formatDate(new Date(data.updatedAt)) }),
            ]}
          />
        )}
        actions={
          <>
            <BudgetViewToggle />
            <MonthSwitcher
              month={month}
              current={current}
              onChange={delta => useBudgetStore.getState().shift(delta)}
              onToday={() => useBudgetStore.getState().setMonth(current)}
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
                      label: t('budget.fill_plan', { month: previousLabel }),
                      icon: 'copy',
                      disabled: !data.previousHasPlan,
                      reason: data.previousHasPlan ? undefined : t('budget.no_previous_plan', { month: previousLabel }),
                      onSelect: () => void copy('PLAN'),
                    },
                    {
                      id: 'fill-actual',
                      label: t('budget.fill_actual', { month: previousLabel }),
                      icon: 'receipt',
                      disabled: !data.previousHasActual,
                      reason: data.previousHasActual ? undefined : t('budget.no_previous_actual', { month: previousLabel }),
                      onSelect: () => void copy('ACTUAL'),
                    },
                    {
                      id: 'fill-rules',
                      label: t('budget.fill_rules'),
                      icon: 'repeat',
                      disabled: !hasBills,
                      reason: hasBills ? undefined : t('budget.no_rules'),
                      onSelect: () => void copy('RULES'),
                    },
                    { id: 'clear', label: t('budget.clear'), icon: 'trash', danger: true, disabled: !data.exists, onSelect: () => setConfirmClear(true) },
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
            <PlanEmptyState data={data} label={label} previousLabel={previousLabel} busy={busy} onCopy={copy} onBlank={() => setBlankMonth(month)} />
          ) : (
            <>
              <BudgetSummaryTiles summary={data.summary} future={tense === 'future'} />
              <BudgetBanners data={data} onShowUncategorised={() => onShowUncategorised(month)} />
              <BudgetTable
                data={data}
                future={tense === 'future'}
                previousLabel={previousLabel}
                onSetPlanned={(categoryId, cents) => useBudgetStore.getState().setPlanned(categoryId, cents)}
                onShowTransactions={categoryId => onShowTransactions(month, categoryId)}
                onSetCarryOver={setCarryOver}
              />
            </>
          )}
        </>
      )}

      {confirmClear && (
        <ConfirmDialog
          title={t('budget.clear_title', { month: label })}
          message={t('budget.clear_message')}
          confirmLabel={t('budget.clear')}
          confirmIcon="trash"
          tone="danger"
          loading={busy === 'clear'}
          onConfirm={() => void clear()}
          onCancel={() => setConfirmClear(false)}
        />
      )}
      {printing && ready && <BudgetPrintModal data={data} onClose={() => setPrinting(false)} />}
    </div>
  )
}

/** No plan yet: the best start first (last month's plan, else its spending, else blank) */
function PlanEmptyState({ data, label, previousLabel, busy, onCopy, onBlank }: {
  data: BudgetMonth
  label: string
  previousLabel: string
  busy: CopySource | 'clear' | null
  onCopy: (source: CopySource) => void
  onBlank: () => void
}) {
  const { t } = useTranslation()
  const options = [
    data.previousHasPlan && { key: 'PLAN', icon: 'copy' as const, label: t('budget.copy_plan', { month: previousLabel }), run: () => onCopy('PLAN') },
    data.groups.some(g => g.categories.some(c => c.suggestedCents > 0)) && { key: 'RULES', icon: 'repeat' as const, label: t('budget.from_bills'), run: () => onCopy('RULES') },
    data.previousHasActual && { key: 'ACTUAL', icon: 'receipt' as const, label: t('budget.from_spending', { month: previousLabel }), run: () => onCopy('ACTUAL') },
    { key: 'blank', icon: 'pencil' as const, label: t('budget.start_blank'), run: onBlank },
  ].filter(o => o !== false)

  return (
    <BudgetEmptyState
      title={t('budget.empty_title', { month: label })}
      body={t('budget.empty_body')}
      actions={options.map((o, i) => (
        <Button
          key={o.key}
          variant={i === 0 ? 'primary' : 'secondary'}
          icon={o.icon}
          loading={busy === o.key}
          disabled={busy !== null}
          onClick={o.run}
        >
          {o.label}
        </Button>
      ))}
    />
  )
}

function BudgetBanners({ data, onShowUncategorised }: { data: BudgetMonth; onShowUncategorised: () => void }) {
  const { t } = useTranslation()
  function showUnplanned() {
    const first = data.groups.flatMap(g => g.categories.filter(c => isUnplanned(g.type, c)))[0]
    document.getElementById(`budget-row-${first?.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  if (data.uncategorisedCount === 0 && data.unplannedCount === 0) return null
  return (
    <div className="mb-4 space-y-2">
      {data.uncategorisedCount > 0 && (
        <Banner
          tone="warning"
          action={<Button size="sm" icon="tag" onClick={onShowUncategorised}>{t('budget.banner_uncategorised_action')}</Button>}
        >
          {t('budget.banner_uncategorised', { count: data.uncategorisedCount })}
        </Banner>
      )}
      {data.unplannedCount > 0 && (
        <Banner tone="info" action={<Button size="sm" variant="ghost" icon="arrow-down" onClick={showUnplanned}>{t('budget.banner_unplanned_action')}</Button>}>
          {t('budget.banner_unplanned', { count: data.unplannedCount, amount: formatMoney(data.unplannedCents) })}
        </Banner>
      )}
    </div>
  )
}

function BudgetPrintModal({ data, onClose }: { data: BudgetMonth; onClose: () => void }) {
  const { t } = useTranslation()
  const build = useCallback(
    (sheetT: TFunction, lang: AppLanguage) => buildBudgetStatement(sheetT, data, monthDate(data.month), lang),
    [data],
  )
  return <ReportPreviewModal title={t('budget.print_title')} build={build} fileName={`budget-${data.month}`} onClose={onClose} />
}
