import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Badge, FilterChip, LIST_GRID, ListCard, ListHeader, ListRow, Money, RowTitle, SortHeader, cx, type BadgeTone, type SelectMenuOption } from '../ui'
import type { IconName } from '../shell/icons'
import { CategoryPicker } from '../transactions/CategoryPicker'
import { RulePrompt } from './RulePrompt'
import { useLedgerStore } from '../../store/ledger'
import { findCategory, kindForAmount, transferAccounts } from '../../lib/ledger'
import { parseTarget, transferValue } from '../../lib/category-target'
import { formatDate } from '../../lib/date-format'
import { keepTextUnselected, rangeKeys } from '../../lib/range-select'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { formatMoney } from '../../../../shared/money'
import {
  SELECTABLE,
  applyToSamePayee,
  filterRows,
  keepsMatch,
  needsCategory,
  offersRule,
  reviewCounts,
  shownStatus,
  sortRows,
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
const MATCHED = 'matched'

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

  const counts = reviewCounts(rows, choices)
  const visible = sortRows(filterRows(rows, choices, filter), sort, i18n.language)
  const tickable = visible.filter(r => SELECTABLE.has(r.status))
  const allTicked = tickable.length > 0 && tickable.every(r => choices[r.line].include)
  // Last ticked line: Shift+click ticks everything between it and the next one
  const anchor = useRef<number | null>(null)

  /** A new column starts ascending; the sorted one flips */
  function sortBy(key: ReviewSortKey) {
    setSort(sort?.key === key ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })
  }
  const direction = (key: ReviewSortKey) => (sort?.key === key ? sort.direction : null)

  function update(line: number, choice: RowChoice) {
    onChoices({ ...choices, [line]: choice })
  }

  function tick(line: number, shift: boolean) {
    const range = shift ? rangeKeys(tickable.map(r => r.line), anchor.current, line) : null
    anchor.current = line
    const include = !choices[line].include
    onChoices({ ...choices, ...Object.fromEntries((range ?? [line]).map(l => [l, { ...choices[l], include }])) })
  }

  function pick(row: PreviewRow, value: string) {
    const target: RowChoice['target'] = value === LINK
      ? { kind: 'link' }
      : value === MATCHED
        ? { kind: 'transfer', toAccountId: null }
        : parseTarget(value)
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
          merchants={[prompt.merchant]}
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
          const status = shownStatus(row, choice)
          const badge = STATUS_BADGE[status]
          return (
            <ListRow key={row.line} cols={COLS} muted={!choice.include}>
              <div>
                {selectable && (
                  <input
                    type="checkbox"
                    aria-label={t('import.tick_row', { name: row.description })}
                    checked={choice.include}
                    onMouseDown={keepTextUnselected}
                    onChange={e => tick(row.line, (e.nativeEvent as MouseEvent).shiftKey)}
                  />
                )}
              </div>
              <div className="text-sm tabular-nums">{row.bookedAt ? formatDate(row.bookedAt) : '—'}</div>
              <RowTitle title={row.description || t('log.no_description')} meta={[explain(row, choice, t, accounts)]} />
              <div>
                {!selectable ? (
                  <span className="text-sm text-fg-muted">—</span>
                ) : (
                  <CategoryPicker
                    categories={categories}
                    value={pickerValue(row, choice)}
                    kind={kindOf(row)}
                    ariaLabel={t('import.goes_to_of', { name: row.description })}
                    placeholder={t('log.to_categorise')}
                    leading={leadingOptions(row, t)}
                    transferTargets={transferAccounts(accounts, accountId, !isIncoming(row))}
                    incoming={isIncoming(row)}
                    onChange={value => pick(row, value)}
                    creatable
                    createGroupId={findCategory(categories, row.suggestion?.categoryId)?.parentId}
                    needsCategory={needsCategory(row, choice)}
                    density="compact"
                    triggerClassName="h-8 w-full text-xs"
                  />
                )}
              </div>
              <div className="text-right">
                {row.amountCents === null ? <span className="text-sm text-fg-muted">—</span> : <Money cents={row.amountCents} signed />}
              </div>
              <div><Badge tone={badge.tone} icon={badge.icon}>{t(`import.status.${status}`)}</Badge></div>
            </ListRow>
          )
        })}
        {visible.length === 0 && <p className="px-4 py-6 text-center text-sm text-fg-muted">{t('import.filter_empty')}</p>}
      </ListCard>
      </div>
    </div>
  )
}

const isIncoming = (row: PreviewRow) => row.amountCents !== null && row.amountCents > 0
const kindOf = (row: PreviewRow) => kindForAmount(row.amountCents ?? 0)

function pickerValue(row: PreviewRow, choice: RowChoice): string | null {
  const { target } = choice
  if (target.kind === 'link') return LINK
  if (keepsMatch(row, choice)) return MATCHED
  if (target.kind === 'transfer') return target.toAccountId ? transferValue(target.toAccountId) : null
  return target.categoryId
}

/** Choices above the categories: link to the hand-entered twin, or keep the transfer the app matched */
function leadingOptions(row: PreviewRow, t: TFunction): SelectMenuOption<string>[] {
  const options: SelectMenuOption<string>[] = []
  if (row.status === 'POSSIBLE_DUPLICATE') options.push({ value: LINK, label: t('import.target_link') })
  if (row.status === 'TRANSFER_MATCH' && row.transferWith) {
    const { accountName, bookedAt } = row.transferWith
    options.push({ value: MATCHED, label: t('import.target_matched', { account: accountName, date: formatDate(bookedAt) }) })
  }
  return options
}

/** The line under the description: why the row has its status, or where its category came from */
function explain(row: PreviewRow, choice: RowChoice, t: TFunction, accounts: AccountSummary[]): string | null {
  switch (row.status) {
    case 'ALREADY_IMPORTED': return t('import.why_already')
    case 'INVALID': return t(`import.why_invalid_${row.problem ?? 'DATE'}`, { line: row.line })
    case 'TRANSFER_MATCH': {
      const other = row.transferWith
      // What it was paired with, so a wrong pair shows at a glance; once changed, it reads like a new row
      if (other && keepsMatch(row, choice)) {
        return t('import.why_transfer', { description: other.description || t('log.no_description'), amount: formatMoney(other.amountCents), date: formatDate(other.bookedAt), account: other.accountName })
      }
      break
    }
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
