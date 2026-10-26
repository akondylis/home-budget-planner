import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Badge, Button, IconButton, LIST_GRID, ListCard, ListHeader, ListRow, Money, RowTitle, cx } from '../ui'
import { Icon } from '../shell/icons'
import { CategoryPicker } from './CategoryPicker'
import { useLedgerStore } from '../../store/ledger'
import { useTransactionsStore } from '../../store/transactions'
import { formatDate } from '../../lib/date-format'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import type { TransactionRow } from '../../../../shared/ledger'

const COLS = cx(LIST_GRID, 'grid-cols-[1.5rem_6.5rem_minmax(0,1fr)_13rem_8.5rem_2.25rem]')

/** What a row is called: payee, else bank text, else its category; a transfer names the other account */
export function rowTitle(row: TransactionRow, t: TFunction): string {
  if (row.transferId) {
    const account = row.transferAccountName ?? '?'
    return row.amountCents < 0 ? t('log.transfer_to', { account }) : t('log.transfer_from', { account })
  }
  return row.payee || row.description || row.categoryName || t('log.no_description')
}

export interface TransactionListProps {
  rows: TransactionRow[]
}

/** The log: tick rows for bulk actions, pick a category inline, click a row to edit it */
export function TransactionList({ rows }: TransactionListProps) {
  const { t } = useTranslation()
  const categories = useLedgerStore(s => s.categories)
  const highlightKey = useLedgerStore(s => s.highlightKey)
  const openEntry = useLedgerStore(s => s.openEntry)
  const selected = useTransactionsStore(s => s.selected)
  const toggleSelected = useTransactionsStore(s => s.toggleSelected)
  const setSelected = useTransactionsStore(s => s.setSelected)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selectable = rows.filter(r => !r.transferId)
  const allTicked = selectable.length > 0 && selectable.every(r => selected.includes(r.id))

  async function applyCategory(ids: string[], categoryId: string) {
    setBusy(true)
    setError(null)
    try {
      await window.api.setCategory(ids, categoryId)
      setSelected([])
      await useLedgerStore.getState().changed()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {selected.length > 0 && (
        <div className="card mb-3 flex flex-wrap items-center gap-3 px-3 py-2" role="toolbar" aria-label={t('log.bulk_label')}>
          <span className="text-sm font-medium text-fg">{t('log.selected', { count: selected.length })}</span>
          <div className="w-56">
            <CategoryPicker
              categories={categories}
              value={null}
              kind="ANY"
              ariaLabel={t('log.set_category')}
              placeholder={t('log.set_category')}
              onChange={id => void applyCategory(selected, id)}
            />
          </div>
          <Button variant="ghost" size="sm" icon="close" onClick={() => setSelected([])} disabled={busy}>
            {t('log.clear_selection')}
          </Button>
        </div>
      )}
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}

      <ListCard>
        <ListHeader cols={COLS}>
          <input
            type="checkbox"
            aria-label={t('log.select_all')}
            title={t('log.select_all')}
            checked={allTicked}
            disabled={selectable.length === 0}
            onChange={() => setSelected(allTicked ? [] : selectable.map(r => r.id))}
          />
          <div>{t('log.col_date')}</div>
          <div>{t('log.col_description')}</div>
          <div>{t('log.col_category')}</div>
          <div className="text-right">{t('log.col_amount')}</div>
          <div />
        </ListHeader>
        {rows.map(row => {
          const title = rowTitle(row, t)
          const ticked = selected.includes(row.id)
          return (
            <ListRow
              key={row.id}
              cols={COLS}
              highlighted={highlightKey !== null && (row.id === highlightKey || row.transferId === highlightKey)}
              onOpen={() => openEntry({ mode: 'edit', row })}
            >
              <div onClick={e => e.stopPropagation()}>
                {!row.transferId && (
                  <input type="checkbox" aria-label={t('log.select_row', { name: title })} checked={ticked} onChange={() => toggleSelected(row.id)} />
                )}
              </div>
              <div className="flex items-center gap-1 text-sm tabular-nums text-fg">
                {formatDate(row.bookedAt)}
                {row.importBatchId && (
                  <span title={t('log.imported')} className="text-gray-500">
                    <Icon name="download" size={12} />
                  </span>
                )}
              </div>
              <RowTitle
                title={title}
                meta={[row.accountName, row.payee && row.description && row.description !== row.payee ? row.description : null, row.note]}
              />
              <div onClick={e => e.stopPropagation()}>
                {row.transferId ? (
                  <Badge tone="info" icon="arrows-up-down" title={t('log.transfer_hint')}>{t('log.transfer')}</Badge>
                ) : (
                  <CategoryPicker
                    categories={categories}
                    value={row.categoryId}
                    kind="ANY"
                    ariaLabel={t('log.category_of', { name: title })}
                    placeholder={t('log.to_categorise')}
                    onChange={id => void applyCategory([row.id], id)}
                    triggerClassName={cx('h-8 w-full text-xs', !row.categoryId && 'border-amber-500 text-amber-700')}
                  />
                )}
              </div>
              <div className="text-right">
                <Money cents={row.amountCents} tone={row.transferId ? 'neutral' : 'auto'} signed />
              </div>
              <IconButton icon="pencil" size="sm" label={t('log.edit')} onClick={e => { e.stopPropagation(); openEntry({ mode: 'edit', row }) }} />
            </ListRow>
          )
        })}
      </ListCard>
    </>
  )
}
