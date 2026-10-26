import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner, Button, ListCard, Money, PageHeader, Pagination, Spinner, StatTile, joinMeta } from '../components/ui'
import { Icon } from '../components/shell/icons'
import { TransactionFilters, monthLabel } from '../components/transactions/TransactionFilters'
import { TransactionList } from '../components/transactions/TransactionList'
import { activeAccounts, useLedgerStore } from '../store/ledger'
import { EMPTY_FILTER, PAGE_SIZES, currentMonth, useTransactionsStore } from '../store/transactions'
import { keysOf } from '../lib/command-palette'
import { ipcErrorMessage } from '../lib/ipc-errors'

export interface TransactionsScreenProps {
  onGoToAccounts: () => void
}

export function TransactionsScreen({ onGoToAccounts }: TransactionsScreenProps) {
  const { t, i18n } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const revision = useLedgerStore(s => s.revision)
  const openEntry = useLedgerStore(s => s.openEntry)
  const { filter, data, loading, error, page, pageSize, setFilter, setPage, setPageSize } = useTransactionsStore()

  // Reload on open and after every write anywhere in the app
  useEffect(() => {
    void useTransactionsStore.getState().fetch()
  }, [revision])

  // The highlight marks the row just saved; leaving the page ends it
  useEffect(() => () => {
    useLedgerStore.setState({ highlightKey: null })
  }, [])

  const open = activeAccounts(accounts)
  const filtered = filter.accountId !== null || filter.categoryType !== null || filter.categoryId !== null || filter.uncategorised
  const account = open.find(a => a.id === filter.accountId)
  const addKeys = keysOf('addTransaction')?.[0]?.join('+')

  const header = (
    <PageHeader
      title={t('log.title')}
      subtitle={joinMeta([
        filter.month ? monthLabel(filter.month, i18n.language) : t('log.all_months'),
        account?.name,
        data && t('log.count', { count: data.total }),
      ])}
      actions={
        <Button variant="primary" icon="plus" onClick={() => openEntry()} disabled={open.length === 0} title={addKeys ? t('shortcuts.with_key', { action: t('log.add'), key: addKeys }) : undefined}>
          {t('log.add')}
        </Button>
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
    </div>
  )
}

function EmptyCard({ icon, title, body, children }: { icon: Parameters<typeof Icon>[0]['name']; title: string; body: string; children?: React.ReactNode }) {
  return (
    <ListCard className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
        <Icon name={icon} size={24} />
      </span>
      <h2 className="mt-4 text-sm font-semibold text-fg">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-fg-muted">{body}</p>
      {children && <div className="mt-4 flex gap-2">{children}</div>}
    </ListCard>
  )
}
