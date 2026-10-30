import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Badge, Button, IconButton, LIST_GRID, ListCard, ListHeader, ListRow, Money, RowTitle, SelectMenu, SortHeader, cx } from '../ui'
import { MemberDot } from '../members/MemberDot'
import { Icon } from '../shell/icons'
import { BulkPayee } from './BulkPayee'
import { CategoryPicker } from './CategoryPicker'
import { RulePrompt } from '../import/RulePrompt'
import { RowContextMenu, type RowMenuTarget } from './RowContextMenu'
import { useLedgerStore } from '../../store/ledger'
import { useTransactionsStore } from '../../store/transactions'
import { formatDate } from '../../lib/date-format'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { bulkTransferAccounts, findCategory, kindForAmount, kindForAmounts, ruleMerchants, transferAccounts } from '../../lib/ledger'
import { parseTarget } from '../../lib/category-target'
import { activeMembers } from '../../lib/members'
import { keepTextUnselected, rangeKeys } from '../../lib/range-select'
import { HOUSEHOLD } from '../../../../shared/members'
import type { LogSortKey, TransactionRow } from '../../../../shared/ledger'
import type { RuleSummary } from '../../../../shared/statement-import'

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

/** How long "Rule saved" stays before the floating prompt closes itself */
const DONE_MS = 5000

/** The log: sort by a column, tick rows for bulk actions, pick a category (or a transfer) inline, click a row to edit it, right-click for more */
export function TransactionList({ rows }: TransactionListProps) {
  const { t } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const categories = useLedgerStore(s => s.categories)
  const members = useLedgerStore(s => s.members)
  const highlightKey = useLedgerStore(s => s.highlightKey)
  const revision = useLedgerStore(s => s.revision)
  const openEntry = useLedgerStore(s => s.openEntry)
  const selected = useTransactionsStore(s => s.selected)
  const toggleSelected = useTransactionsStore(s => s.toggleSelected)
  const setSelected = useTransactionsStore(s => s.setSelected)
  const sort = useTransactionsStore(s => s.sort)
  const setSort = useTransactionsStore(s => s.setSort)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // "Always put X in Y?" after sorting imported rows by hand: one rule per merchant
  const [prompt, setPrompt] = useState<{ merchants: string[]; categoryId: string; busy: boolean; done: string | null; error: string | null } | null>(null)
  // Known rules, so a merchant a rule already sorts there is not offered again
  const [rules, setRules] = useState<RuleSummary[]>([])
  const [menu, setMenu] = useState<RowMenuTarget | null>(null)

  useEffect(() => {
    let alive = true
    window.api.listRules()
      .then(list => { if (alive) setRules(list) })
      .catch(err => console.error('[rules] list failed:', err))
    return () => { alive = false }
  }, [revision])

  // "Rule saved" closes itself; the question waits for an answer
  const done = prompt?.done ?? null
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setPrompt(null), DONE_MS)
    return () => clearTimeout(timer)
  }, [done])

  const selectable = rows.filter(r => !r.transferId)
  const direction = (key: LogSortKey) => (sort.key === key ? sort.direction : null)
  const allTicked = selectable.length > 0 && selectable.every(r => selected.includes(r.id))
  // Last ticked row: Shift+click ticks everything between it and the next one
  const anchor = useRef<string | null>(null)

  function tick(id: string, shift: boolean) {
    const range = shift ? rangeKeys(selectable.map(r => r.id), anchor.current, id) : null
    anchor.current = id
    if (!range) return toggleSelected(id)
    const on = !selected.includes(id)
    setSelected(on ? [...new Set([...selected, ...range])] : selected.filter(x => !range.includes(x)))
  }

  async function applyCategory(ids: string[], categoryId: string) {
    setBusy(true)
    setError(null)
    try {
      await window.api.setCategory(ids, categoryId)
      setSelected([])
      const merchants = ruleMerchants(rows.filter(r => ids.includes(r.id)), rules, categoryId)
      setPrompt(merchants.length > 0 ? { merchants, categoryId, busy: false, done: null, error: null } : null)
      await useLedgerStore.getState().changed()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  /** Picked for one row or the ticked ones: a category, or a transfer to/from one of my accounts (the other sides are written too) */
  async function pick(ids: string[], value: string) {
    const target = parseTarget(value)
    if (target.kind === 'category') return applyCategory(ids, target.categoryId)
    setBusy(true)
    setError(null)
    setPrompt(null)
    try {
      const [transferId] = await window.api.makeTransfer(ids, target.toAccountId)
      setSelected([])
      useLedgerStore.setState({ highlightKey: transferId })
      await useLedgerStore.getState().changed()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  async function applyMember(ids: string[], value: string) {
    setBusy(true)
    setError(null)
    try {
      await window.api.setMember(ids, value === HOUSEHOLD ? null : value)
      setSelected([])
      await useLedgerStore.getState().changed()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  async function applyPayee(ids: string[], payee: string | null) {
    setBusy(true)
    setError(null)
    try {
      await window.api.setPayee(ids, payee)
      setSelected([])
      await useLedgerStore.getState().changed()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  const dismissPrompt = useCallback(() => setPrompt(null), [])
  const selectedRows = rows.filter(r => selected.includes(r.id))
  const sharedPayee = selectedRows.every(r => r.payee === selectedRows[0]?.payee) ? (selectedRows[0]?.payee ?? '') : ''

  async function acceptRule() {
    if (!prompt) return
    const { merchants, categoryId } = prompt
    setPrompt({ ...prompt, busy: true, error: null })
    let saved = 0
    let sorted = 0
    try {
      for (const pattern of merchants) {
        const { appliedCount } = await window.api.createRule({ pattern, categoryId, applyToUncategorised: true })
        saved++
        sorted += appliedCount
      }
      const one = merchants.length === 1
      setPrompt({
        ...prompt,
        busy: false,
        done: sorted > 0
          ? (one ? t('rules.saved_more', { count: sorted }) : t('rules.saved_many_sorted', { rules: saved, count: sorted }))
          : (one ? t('rules.saved') : t('rules.saved_many', { count: saved })),
      })
    } catch (err) {
      const error = ipcErrorMessage(err, t)
      // The ones saved stay; offer the rest again
      setPrompt({
        ...prompt,
        merchants: merchants.slice(saved),
        busy: false,
        error: saved > 0 ? `${t('rules.saved_partly', { saved, total: merchants.length })} ${error}` : error,
      })
    }
    if (saved > 0) await useLedgerStore.getState().changed()
  }

  /** Right-click at the pointer; the Menu key / Shift+F10 (no pointer position) opens it at the focused control */
  function openMenu(e: ReactMouseEvent<HTMLElement>, row: TransactionRow) {
    e.preventDefault()
    const focused = document.activeElement
    const from = focused && e.currentTarget.contains(focused) ? focused : e.currentTarget
    const box = e.clientX === 0 && e.clientY === 0 ? from.getBoundingClientRect() : null
    setMenu({ row, x: box ? box.left : e.clientX, y: box ? box.bottom : e.clientY })
  }

  return (
    <>
      {prompt && (
        <RulePrompt
          merchants={prompt.merchants}
          categoryName={findCategory(categories, prompt.categoryId)?.name ?? ''}
          busy={prompt.busy}
          done={prompt.done}
          error={prompt.error}
          floating
          onAccept={() => void acceptRule()}
          onDismiss={dismissPrompt}
        />
      )}
      <RowContextMenu
        target={menu}
        selectedRows={selectedRows}
        rules={rules}
        onClose={() => setMenu(null)}
        onPick={(ids, value) => void pick(ids, value)}
        onMember={(ids, value) => void applyMember(ids, value)}
        onTick={id => tick(id, false)}
        onError={setError}
      />
      {selected.length > 0 && (
        <div className="card mb-3 flex flex-wrap items-center gap-3 px-3 py-2" role="toolbar" aria-label={t('log.bulk_label')}>
          <span className="text-sm font-medium text-fg">{t('log.selected', { count: selected.length })}</span>
          <div className="w-56">
            <CategoryPicker
              categories={categories}
              value={null}
              kind={kindForAmounts(selectedRows.map(r => r.amountCents))}
              ariaLabel={t('log.set_category')}
              placeholder={t('log.set_category')}
              transferTargets={bulkTransferAccounts(accounts, selectedRows)}
              incoming={selectedRows.length > 0 && selectedRows.every(r => r.amountCents > 0)}
              onChange={value => void pick(selected, value)}
              creatable
            />
          </div>
          <BulkPayee count={selected.length} initial={sharedPayee} disabled={busy} onApply={payee => void applyPayee(selected, payee)} />
          {activeMembers(members).length > 0 && (
            <SelectMenu<string>
              value={null}
              ariaLabel={t('log.set_for')}
              placeholder={t('log.set_for')}
              onChange={v => void applyMember(selected, v)}
              options={[
                { value: HOUSEHOLD, label: t('members.household') },
                ...activeMembers(members).map(m => ({ value: m.id, label: <MemberDot colour={m.colour} name={m.name} />, searchText: m.name })),
              ]}
              triggerClassName="min-w-40"
            />
          )}
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
          <SortHeader direction={direction('date')} onSort={() => setSort('date')}>{t('log.col_date')}</SortHeader>
          <SortHeader direction={direction('description')} onSort={() => setSort('description')}>{t('log.col_description')}</SortHeader>
          <SortHeader direction={direction('category')} onSort={() => setSort('category')}>{t('log.col_category')}</SortHeader>
          <SortHeader direction={direction('amount')} onSort={() => setSort('amount')} align="right">{t('log.col_amount')}</SortHeader>
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
              onContextMenu={e => openMenu(e, row)}
            >
              <div onClick={e => e.stopPropagation()}>
                {!row.transferId && (
                  <input
                    type="checkbox"
                    aria-label={t('log.select_row', { name: title })}
                    checked={ticked}
                    onMouseDown={keepTextUnselected}
                    onChange={e => tick(row.id, (e.nativeEvent as MouseEvent).shiftKey)}
                  />
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
                meta={[
                  row.memberName ? t('log.for_member', { name: row.memberName }) : null,
                  row.accountName,
                  row.payee && row.description && row.description !== row.payee ? row.description : null,
                  row.note,
                ]}
              />
              <div onClick={e => e.stopPropagation()}>
                {row.transferId ? (
                  <Badge tone="info" icon="arrows-up-down" title={t('log.transfer_hint')}>{t('log.transfer')}</Badge>
                ) : (
                  <CategoryPicker
                    categories={categories}
                    value={row.categoryId}
                    kind={kindForAmount(row.amountCents)}
                    ariaLabel={t('log.category_of', { name: title })}
                    placeholder={t('log.to_categorise')}
                    transferTargets={transferAccounts(accounts, row.accountId, row.amountCents < 0)}
                    incoming={row.amountCents > 0}
                    onChange={value => void pick([row.id], value)}
                    creatable
                    needsCategory={!row.categoryId}
                    density="compact"
                    triggerClassName="h-8 w-full text-xs"
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
