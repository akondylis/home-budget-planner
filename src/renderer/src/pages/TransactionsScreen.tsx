import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner, Button, ConfirmDialog, EmptyCard, Money, PageHeader, Pagination, Spinner, StatTile, joinMeta } from '../components/ui'
import { TransactionFilters, monthLabel } from '../components/transactions/TransactionFilters'
import { TransactionList } from '../components/transactions/TransactionList'
import { activeAccounts, useLedgerStore } from '../store/ledger'
import { EMPTY_FILTER, PAGE_SIZES, currentMonth, useTransactionsStore } from '../store/transactions'
import { useImportStore } from '../store/import'
import { ReconciliationBanner, balanceGap } from '../components/import/ReconciliationNote'
import { SubscriptionHints } from '../components/subscriptions/SubscriptionHints'
import type { SubscriptionHint } from '../../../shared/statement-import'
import { keysOf } from '../lib/command-palette'
import { ipcErrorMessage } from '../lib/ipc-errors'

export interface TransactionsScreenProps {
  onGoToAccounts: () => void
  onImport: () => void
  onManageCategories: () => void
}

export function TransactionsScreen({ onGoToAccounts, onImport, onManageCategories }: TransactionsScreenProps) {
  const { t, i18n } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const revision = useLedgerStore(s => s.revision)
  const openEntry = useLedgerStore(s => s.openEntry)
  const { filter, data, loading, error, page, pageSize, setFilter, setPage, setPageSize } = useTransactionsStore()
  const lastImport = useImportStore(s => s.last)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [undoMessage, setUndoMessage] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null)
  const dismissedHints = useLedgerStore(s => s.dismissedHints)
  const [hints, setHints] = useState<SubscriptionHint[]>([])
  const [hintsOpen, setHintsOpen] = useState(false)

  // Reload on open and after every write anywhere in the app
  useEffect(() => {
    void useTransactionsStore.getState().fetch()
  }, [revision])

  // Recomputed after every write: sorting one as a subscription makes it go away
  useEffect(() => {
    let alive = true
    window.api.subscriptionHints()
      .then(list => { if (alive) setHints(list) })
      .catch(err => console.error('[subscriptions] hints failed:', err))
    return () => { alive = false }
  }, [revision])

  // The highlight marks the row just saved; leaving the page ends it
  useEffect(() => () => {
    useLedgerStore.setState({ highlightKey: null })
  }, [])

  const open = activeAccounts(accounts)
  const filtered = filter.accountId !== null || filter.categoryType !== null || filter.categoryId !== null || filter.uncategorised || filter.importBatchId !== null
  const account = open.find(a => a.id === filter.accountId)
  const addKeys = keysOf('addTransaction')?.[0]?.join('+')
  const justImported = lastImport !== null && lastImport.batchId === filter.importBatchId
  const openHints = hints.filter(h => !dismissedHints.includes(h.key))

  function showAll() {
    setFilter({ importBatchId: null, month: currentMonth() })
  }

  async function undoImport() {
    if (!lastImport) return
    setUndoing(true)
    try {
      const { removedCount } = await window.api.undoImport(lastImport.batchId)
      useImportStore.getState().clearLast()
      setConfirmUndo(false)
      setUndoMessage({ tone: 'success', text: t('import.undone', { count: removedCount }) })
      showAll()
      await useLedgerStore.getState().changed()
    } catch (err) {
      setConfirmUndo(false)
      setUndoMessage({ tone: 'warning', text: ipcErrorMessage(err, t) })
    } finally {
      setUndoing(false)
    }
  }

  const header = (
    <PageHeader
      title={t('log.title')}
      subtitle={joinMeta([
        filter.month ? monthLabel(filter.month, i18n.language) : t('log.all_months'),
        account?.name,
        data && t('log.count', { count: data.total }),
      ])}
      actions={
        <>
        <Button variant="ghost" icon="tag" onClick={onManageCategories}>{t('categories.manage')}</Button>
        <Button icon="download" onClick={onImport} disabled={open.length === 0}>{t('import.command')}</Button>
        <Button variant="primary" icon="plus" onClick={() => openEntry()} disabled={open.length === 0} title={addKeys ? t('shortcuts.with_key', { action: t('log.add'), key: addKeys }) : undefined}>
          {t('log.add')}
        </Button>
        </>
      }
    />
  )

  if (open.length === 0) {
    return (
      <div className="mx-auto max-w-6xl">
        {header}
        <EmptyCard icon="bank" title={t('log.no_accounts_title')} body={t('log.no_accounts_body')}>
          <Button icon="arrow-right" onClick={onGoToAccounts}>{t('log.go_to_accounts')}</Button>
        </EmptyCard>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      {header}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatTile icon="arrow-down" label={t('log.income')} value={<Money cents={data?.incomeCents ?? 0} />} />
        <StatTile icon="arrow-up" label={t('log.expenses')} value={<Money cents={Math.abs(data?.expenseCents ?? 0)} />} />
        <StatTile
          icon="wallet"
          label={t('log.net')}
          value={<Money cents={(data?.incomeCents ?? 0) + (data?.expenseCents ?? 0)} signed />}
          hint={t('log.net_hint')}
        />
      </div>

      <TransactionFilters />

      {undoMessage && (
        <Banner
          tone={undoMessage.tone}
          className="mb-3"
          action={<Button size="sm" variant="ghost" icon="close" onClick={() => setUndoMessage(null)}>{t('common.close')}</Button>}
        >
          {undoMessage.text}
        </Banner>
      )}

      {filter.importBatchId && (
        <Banner
          tone={justImported ? 'success' : 'info'}
          icon={justImported ? 'check' : 'download'}
          className="mb-3"
          action={
            <div className="flex gap-2">
              {justImported && <Button size="sm" icon="undo" onClick={() => setConfirmUndo(true)}>{t('import.undo')}</Button>}
              <Button size="sm" variant="ghost" icon="close" onClick={showAll}>{t('import.show_all')}</Button>
            </div>
          }
        >
          {justImported
            ? joinMeta([
                t('import.done', { count: lastImport.importedCount + lastImport.linkedCount }),
                lastImport.toCategorise > 0 && t('import.done_to_categorise', { count: lastImport.toCategorise }),
                lastImport.reconciliation && balanceGap(lastImport.reconciliation) === 0 && t('import.balance_matches'),
              ])
            : t('import.showing_one')}
        </Banner>
      )}

      {justImported && lastImport.reconciliation && <ReconciliationBanner reconciliation={lastImport.reconciliation} />}

      {openHints.length > 0 && !filter.importBatchId && (
        <Banner
          tone="info"
          icon="repeat"
          className="mb-3"
          action={<Button size="sm" onClick={() => setHintsOpen(true)}>{t('subscriptions.review')}</Button>}
        >
          {t('subscriptions.banner', { count: openHints.length, names: openHints.slice(0, 2).map(h => h.label).join(', ') })}
        </Banner>
      )}

      {data && data.uncategorisedCount > 0 && !filter.uncategorised && (
        <Banner
          tone="warning"
          className="mb-3"
          action={<Button size="sm" onClick={() => setFilter({ uncategorised: true })}>{t('log.show_them')}</Button>}
        >
          {t('log.uncategorised_banner', { count: data.uncategorisedCount })}
        </Banner>
      )}

      {error ? (
        <Banner tone="warning" action={<Button size="sm" icon="refresh" onClick={() => void useTransactionsStore.getState().fetch()}>{t('log.retry')}</Button>}>
          {ipcErrorMessage(error, t)}
        </Banner>
      ) : !data ? (
        <div className="flex justify-center py-12 text-fg-muted"><Spinner size={20} /></div>
      ) : data.total === 0 ? (
        filter.uncategorised ? (
          <EmptyCard icon="check-circle" title={t('log.all_sorted_title')} body={t('log.all_sorted_body')}>
            <Button onClick={() => setFilter({ uncategorised: false })}>{t('log.show_all')}</Button>
          </EmptyCard>
        ) : filtered ? (
          <EmptyCard icon="filter" title={t('log.no_match_title')} body={t('log.no_match_body')}>
            <Button icon="close" onClick={() => setFilter({ ...EMPTY_FILTER(), month: filter.month })}>{t('ui.filter_clear_all')}</Button>
          </EmptyCard>
        ) : (
          <EmptyCard
            icon="receipt"
            title={filter.month ? t('log.empty_month_title', { month: monthLabel(filter.month, i18n.language) }) : t('log.empty_title')}
            body={t('log.empty_body', { keys: addKeys ?? '' })}
          >
            {filter.month && filter.month !== currentMonth() && (
              <Button onClick={() => setFilter({ month: currentMonth() })}>{t('log.this_month')}</Button>
            )}
          </EmptyCard>
        )
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : undefined}>
          <TransactionList rows={data.rows} />
          <div className="mt-3">
            <Pagination
              page={page}
              totalPages={Math.ceil(data.total / pageSize)}
              onChange={setPage}
              pageSize={pageSize}
              pageSizes={PAGE_SIZES}
              total={data.total}
              onPageSizeChange={setPageSize}
            />
          </div>
        </div>
      )}

      {hintsOpen && <SubscriptionHints hints={openHints} onClose={() => setHintsOpen(false)} />}

      {confirmUndo && lastImport && (
        <ConfirmDialog
          title={t('import.undo_title')}
          message={t('import.undo_message', { count: lastImport.importedCount })}
          confirmLabel={t('import.undo')}
          confirmIcon="undo"
          tone="danger"
          loading={undoing}
          onConfirm={() => void undoImport()}
          onCancel={() => setConfirmUndo(false)}
        />
      )}
    </div>
  )
}
