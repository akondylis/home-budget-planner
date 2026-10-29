import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Badge, FilterChip, LIST_GRID, ListCard, ListHeader, ListRow, Money, RowTitle, SortHeader, cx, type BadgeTone, type SelectMenuOption } from '../ui'
import { Icon, type IconName } from '../shell/icons'
import { CategoryPicker } from '../transactions/CategoryPicker'
import { QuickCategoryDialog } from '../categories/QuickCategoryDialog'
import { RulePrompt } from './RulePrompt'
import { useLedgerStore } from '../../store/ledger'
import { findCategory } from '../../lib/ledger'
import { formatDate } from '../../lib/date-format'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import {
  SELECTABLE,
  applyToSamePayee,
  filterRows,
  needsCategory,
  offersRule,
  reviewCounts,
  sortRows,
  transferAccounts,
  type Choices,
  type ReviewFilter,
  type ReviewSort,
  type ReviewSortKey,
  type RowChoice,
} from '../../lib/import-review'
import { merchantText } from '../../../../shared/payee-key'
import type { AccountSummary } from '../../../../shared/ledger'
import { ROW_STATUSES, type PreviewRow, type PreviewSummary, type RowStatus } from '../../../../shared/statement-import'

const COLS = cx(LIST_GRID, 'grid-cols-[1.5rem_6rem_minmax(0,1fr)_14rem_7.5rem_9.5rem]')

const STATUS_BADGE: Record<RowStatus, { tone: BadgeTone; icon: IconName }> = {
  NEW: { tone: 'success', icon: 'plus' },
  ALREADY_IMPORTED: { tone: 'neutral', icon: 'check' },
  POSSIBLE_DUPLICATE: { tone: 'warning', icon: 'copy' },
  TRANSFER_MATCH: { tone: 'info', icon: 'arrows-up-down' },
  INVALID: { tone: 'danger', icon: 'alert-triangle' },
}

// Picker values that are not categories
const LINK = 'link'
const TRANSFER_TO = 'transfer:'

export interface ImportReviewProps {
  accountId: string
  rows: PreviewRow[]
  summary: PreviewSummary
  choices: Choices
  onChoices: (choices: Choices) => void
}

interface Prompt {
  payeeKey: string
  merchant: string
  categoryId: string
  categoryName: string
  busy: boolean
  done: string | null
  error: string | null
}

/** Review: the summary line filters the table; tick rows, pick where each goes */
export function ImportReview({ accountId, rows, summary, choices, onChoices }: ImportReviewProps) {
  const { t, i18n } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const categories = useLedgerStore(s => s.categories)
  const [filter, setFilter] = useState<ReviewFilter>('ALL')
  // null = statement order
  const [sort, setSort] = useState<ReviewSort | null>(null)
  // Rows the user sorted by hand: a new rule does not overwrite them
  const [touched, setTouched] = useState<ReadonlySet<number>>(new Set())
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  // A category typed in a row's picker that does not exist yet
  const [creating, setCreating] = useState<{ row: PreviewRow; name: string } | null>(null)

  const counts = reviewCounts(rows, choices)
  const visible = sortRows(filterRows(rows, choices, filter), sort, i18n.language)
  const tickable = visible.filter(r => SELECTABLE.has(r.status))
  const allTicked = tickable.length > 0 && tickable.every(r => choices[r.line].include)

  /** A new column starts ascending; the sorted one flips */
  function sortBy(key: ReviewSortKey) {
    setSort(sort?.key === key ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })
  }
  const direction = (key: ReviewSortKey) => (sort?.key === key ? sort.direction : null)

  function update(line: number, choice: RowChoice) {
    onChoices({ ...choices, [line]: choice })
  }

  function pick(row: PreviewRow, value: string) {
    const target: RowChoice['target'] = value === LINK
      ? { kind: 'link' }
      : value.startsWith(TRANSFER_TO)
        ? { kind: 'transfer', toAccountId: value.slice(TRANSFER_TO.length) }
        : { kind: 'category', categoryId: value }
    update(row.line, { include: true, target })
    setTouched(new Set(touched).add(row.line))
    if (target.kind === 'category' && offersRule(row, value)) {
      setPrompt({
        payeeKey: row.payeeKey,
        merchant: merchantText(row.description) || row.description,
        categoryId: value,
        categoryName: findCategory(categories, value)?.name ?? '',
        busy: false,
        done: null,
        error: null,
      })
    } else {
      setPrompt(null)
    }
  }

  async function acceptRule() {
    if (!prompt) return
    setPrompt({ ...prompt, busy: true, error: null })
    try {
      const { appliedCount } = await window.api.createRule({ pattern: prompt.merchant, categoryId: prompt.categoryId, applyToUncategorised: true })
      const applied = applyToSamePayee(rows, choices, prompt.payeeKey, prompt.categoryId, touched)
      onChoices(applied.choices)
      const more = applied.changed + appliedCount
      setPrompt({ ...prompt, busy: false, done: more > 0 ? t('rules.saved_more', { count: more }) : t('rules.saved') })
      if (appliedCount > 0) void useLedgerStore.getState().changed()
    } catch (err) {
      setPrompt({ ...prompt, busy: false, error: ipcErrorMessage(err, t) })
    }
  }

  const chips: { filter: ReviewFilter; count: number }[] = [
    ...ROW_STATUSES.filter(s => summary.counts[s] > 0).map(s => ({ filter: s as ReviewFilter, count: summary.counts[s] })),
    ...(counts.toCategorise > 0 ? [{ filter: 'TO_CATEGORISE' as const, count: counts.toCategorise }] : []),
  ]

  return (
    // Only the table scrolls, so its header and the chips above stay in view
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={t('import.summary_label')}>
        <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')}>{t('import.filter_all', { count: rows.length })}</FilterChip>
        {chips.map(c => (
          <FilterChip key={c.filter} active={filter === c.filter} onClick={() => setFilter(filter === c.filter ? 'ALL' : c.filter)}>
            {t(`import.chip.${c.filter}`, { count: c.count })}
          </FilterChip>
        ))}
      </div>

      {prompt && (
        <RulePrompt
          merchant={prompt.merchant}
          categoryName={prompt.categoryName}
          busy={prompt.busy}
          done={prompt.done}
          error={prompt.error}
          onAccept={() => void acceptRule()}
          onDismiss={() => setPrompt(null)}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl">
      <ListCard>
        <ListHeader cols={COLS}>
          <input
            type="checkbox"
            aria-label={t('import.tick_all')}
            title={t('import.tick_all')}
            checked={allTicked}
            disabled={tickable.length === 0}
            onChange={() => onChoices({ ...choices, ...Object.fromEntries(tickable.map(r => [r.line, { ...choices[r.line], include: !allTicked }])) })}
          />
          <SortHeader direction={direction('date')} onSort={() => sortBy('date')}>{t('log.col_date')}</SortHeader>
          <SortHeader direction={direction('description')} onSort={() => sortBy('description')}>{t('log.col_description')}</SortHeader>
          <div>{t('import.col_goes_to')}</div>
          <SortHeader direction={direction('amount')} onSort={() => sortBy('amount')} align="right">{t('log.col_amount')}</SortHeader>
          <div>{t('import.col_status')}</div>
        </ListHeader>
        {visible.map(row => {
          const choice = choices[row.line]
          const selectable = SELECTABLE.has(row.status)
          const badge = STATUS_BADGE[row.status]
          return (
            <ListRow key={row.line} cols={COLS} muted={!choice.include}>
              <div>
                {selectable && (
                  <input
                    type="checkbox"
                    aria-label={t('import.tick_row', { name: row.description })}
                    checked={choice.include}
                    onChange={() => update(row.line, { ...choice, include: !choice.include })}
                  />
                )}
              </div>
              <div className="text-sm tabular-nums">{row.bookedAt ? formatDate(row.bookedAt) : '—'}</div>
              <RowTitle title={row.description || t('log.no_description')} meta={[explain(row, choice, t, accounts)]} />
              <div>
                {!selectable ? (
                  <span className="text-sm text-fg-muted">—</span>
                ) : row.status === 'TRANSFER_MATCH' ? (
                  <span className="flex items-center gap-1.5 text-sm text-fg">
                    <Icon name="arrows-up-down" size={14} className="shrink-0 text-fg-muted" />
                    {row.transferWith?.accountName}
                  </span>
                ) : (
                  <CategoryPicker
                    categories={categories}
                    value={pickerValue(choice)}
                    kind={kindOf(row)}
                    ariaLabel={t('import.goes_to_of', { name: row.description })}
                    placeholder={t('log.to_categorise')}
                    leading={leadingOptions(row, transferAccounts(accounts, accountId, !isIncoming(row)), t)}
                    onChange={value => pick(row, value)}
                    onCreate={name => setCreating({ row, name })}
                    density="compact"
                    triggerClassName={cx('h-8 w-full text-xs', needsCategory(row, choice) && 'border-amber-500 text-amber-700')}
                  />
                )}
              </div>
              <div className="text-right">
                {row.amountCents === null ? <span className="text-sm text-fg-muted">—</span> : <Money cents={row.amountCents} signed />}
              </div>
              <div><Badge tone={badge.tone} icon={badge.icon}>{t(`import.status.${row.status}`)}</Badge></div>
            </ListRow>
          )
        })}
        {visible.length === 0 && <p className="px-4 py-6 text-center text-sm text-fg-muted">{t('import.filter_empty')}</p>}
      </ListCard>
      </div>

      {creating && (
        <QuickCategoryDialog
          categories={categories}
          initialName={creating.name}
          kind={kindOf(creating.row)}
          groupId={findCategory(categories, creating.row.suggestion?.categoryId)?.parentId}
          onClose={() => setCreating(null)}
          onCreated={id => {
            const { row } = creating
            setCreating(null)
            pick(row, id)
          }}
        />
      )}
    </div>
  )
}

const isIncoming = (row: PreviewRow) => row.amountCents !== null && row.amountCents > 0
const kindOf = (row: PreviewRow) => (isIncoming(row) ? 'INCOME' : 'EXPENSE')

function pickerValue(choice: RowChoice): string | null {
  const { target } = choice
  if (target.kind === 'link') return LINK
  if (target.kind === 'transfer') return target.toAccountId ? `${TRANSFER_TO}${target.toAccountId}` : null
  return target.categoryId
}

/**
 * Choices above the categories: link to the hand-entered twin, then a transfer to (or from)
 * one of our own accounts, cash first for an ATM withdrawal
 */
function leadingOptions(row: PreviewRow, targets: AccountSummary[], t: TFunction): SelectMenuOption<string>[] {
  const options: SelectMenuOption<string>[] = row.status === 'POSSIBLE_DUPLICATE' ? [{ value: LINK, label: t('import.target_link') }] : []
  if (targets.length === 0) return options
  const label = isIncoming(row) ? 'import.transfer_from' : 'import.transfer_to'
  options.push({ value: 'transfer-heading', label: t('import.transfer_heading'), kind: 'heading' })
  for (const a of targets) {
    options.push({
      value: `${TRANSFER_TO}${a.id}`,
      label: t(label, { account: a.name }),
      searchText: [t('import.transfer_search'), t('import.transfer_heading'), a.name, a.institutionName].filter(Boolean).join(' '),
    })
  }
  return options
}

/** The line under the description: why the row has its status, or where its category came from */
function explain(row: PreviewRow, choice: RowChoice, t: TFunction, accounts: AccountSummary[]): string | null {
  switch (row.status) {
    case 'ALREADY_IMPORTED': return t('import.why_already')
    case 'INVALID': return t(`import.why_invalid_${row.problem ?? 'DATE'}`, { line: row.line })
    case 'TRANSFER_MATCH': return row.transferWith ? t('import.why_transfer', { date: formatDate(row.transferWith.bookedAt) }) : null
    case 'POSSIBLE_DUPLICATE':
      return row.duplicateOf
        ? t('import.why_duplicate', { date: formatDate(row.duplicateOf.bookedAt), payee: row.duplicateOf.payee ?? t('log.no_description') })
        : null
  }
  if (choice.target.kind === 'transfer' && choice.target.toAccountId) {
    const other = accounts.find(a => a.id === (choice.target as { toAccountId: string }).toAccountId)
    const account = other?.name ?? ''
    if (row.transferHint === 'ATM' && other?.kind === 'CASH') return t('import.why_atm', { account })
    return t(isIncoming(row) ? 'import.why_transfer_from' : 'import.why_transfer_to', { account })
  }
  if (row.transferHint === 'CARD_PAYMENT') return t('import.why_card_payment')
  const s = row.suggestion
  if (s && choice.target.kind === 'category' && choice.target.categoryId === s.categoryId) {
    return s.source.kind === 'rule' ? t('import.why_rule', { merchant: s.payee ?? (merchantText(row.description) || row.description) }) : t('import.why_history')
  }
  return null
}
