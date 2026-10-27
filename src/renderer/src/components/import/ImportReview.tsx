import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Badge, FilterChip, LIST_GRID, ListCard, ListHeader, ListRow, Money, RowTitle, cx, type BadgeTone, type SelectMenuOption } from '../ui'
import { Icon, type IconName } from '../shell/icons'
import { CategoryPicker } from '../transactions/CategoryPicker'
import { RulePrompt } from './RulePrompt'
import { useLedgerStore } from '../../store/ledger'
import { findCategory } from '../../lib/ledger'
import { formatDate } from '../../lib/date-format'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import {
  SELECTABLE,
  applyToSamePayee,
  cashAccounts,
  filterRows,
  needsCategory,
  offersRule,
  reviewCounts,
  type Choices,
  type ReviewFilter,
  type RowChoice,
} from '../../lib/import-review'
import { merchantText } from '../../../../shared/payee-key'
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
  const { t } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const categories = useLedgerStore(s => s.categories)
  const [filter, setFilter] = useState<ReviewFilter>('ALL')
  // Rows the user sorted by hand: a new rule does not overwrite them
  const [touched, setTouched] = useState<ReadonlySet<number>>(new Set())
  const [prompt, setPrompt] = useState<Prompt | null>(null)

  const cash = cashAccounts(accounts, accountId)
  const counts = reviewCounts(rows, choices)
  const visible = filterRows(rows, choices, filter)
  const tickable = visible.filter(r => SELECTABLE.has(r.status))
  const allTicked = tickable.length > 0 && tickable.every(r => choices[r.line].include)

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
    <>
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
          <div>{t('log.col_date')}</div>
          <div>{t('log.col_description')}</div>
          <div>{t('import.col_goes_to')}</div>
          <div className="text-right">{t('log.col_amount')}</div>
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
                    kind={row.amountCents !== null && row.amountCents > 0 ? 'INCOME' : 'EXPENSE'}
                    ariaLabel={t('import.goes_to_of', { name: row.description })}
                    placeholder={t('log.to_categorise')}
                    leading={leadingOptions(row, cash, t)}
                    onChange={value => pick(row, value)}
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
    </>
  )
}

function pickerValue(choice: RowChoice): string | null {
  const { target } = choice
  if (target.kind === 'link') return LINK
  if (target.kind === 'transfer') return target.toAccountId ? `${TRANSFER_TO}${target.toAccountId}` : null
  return target.categoryId
}

/** Choices above the categories: link to the hand-entered twin, or move an ATM withdrawal to Cash */
function leadingOptions(row: PreviewRow, cash: { id: string; name: string }[], t: TFunction): SelectMenuOption<string>[] {
  if (row.status === 'POSSIBLE_DUPLICATE') return [{ value: LINK, label: t('import.target_link') }]
  if (row.transferHint === 'ATM') return cash.map(a => ({ value: `${TRANSFER_TO}${a.id}`, label: t('import.target_transfer', { account: a.name }) }))
  return []
}

/** The line under the description: why the row has its status, or where its category came from */
function explain(row: PreviewRow, choice: RowChoice, t: TFunction, accounts: { id: string; name: string }[]): string | null {
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
    const to = accounts.find(a => a.id === (choice.target as { toAccountId: string }).toAccountId)?.name ?? ''
    return t('import.why_atm', { account: to })
  }
  if (row.transferHint === 'CARD_PAYMENT') return t('import.why_card_payment')
  const s = row.suggestion
  if (s && choice.target.kind === 'category' && choice.target.categoryId === s.categoryId) {
    return s.source.kind === 'rule' ? t('import.why_rule', { merchant: s.payee ?? (merchantText(row.description) || row.description) }) : t('import.why_history')
  }
  return null
}
