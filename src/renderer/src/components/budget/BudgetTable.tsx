import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { ActionMenu, Badge, CollapsibleCard, LIST_GRID, ListHeader, Meter, Money, cx } from '../ui'
import { PlannedCell } from './PlannedCell'
import { formatMoney } from '../../../../shared/money'
import { isOutgoing, roundUpToUnit, type BudgetCategoryRow, type BudgetGroupRow, type BudgetMonth } from '../../../../shared/budget'
import { CATEGORY_TYPES, type CategoryType } from '../../../../shared/ledger'
import { meterTone } from '../../lib/budget'

const COLS = cx(LIST_GRID, 'grid-cols-[minmax(0,1fr)_7.5rem_6.5rem_6.5rem_5rem_2rem]')

export interface BudgetTableProps {
  data: BudgetMonth
  /** Nothing booked yet: actuals show "—" and meters are hidden */
  future: boolean
  /** Label of last month, for "+€20 from September" */
  previousLabel: string
  onSetPlanned: (categoryId: string, cents: number) => Promise<void>
  onShowTransactions: (categoryId: string) => void
  onSetCarryOver: (categoryId: string, carryOver: boolean) => void
}

/** Spending with nothing planned or carried: flagged in the row and counted in the banner */
export const isUnplanned = (type: CategoryType, c: BudgetCategoryRow) => isOutgoing(type) && c.actualCents > 0 && c.availableCents === 0

/** One card per category type (Income first), each group a sub-header with its sums */
export function BudgetTable(props: BudgetTableProps) {
  const { t } = useTranslation()
  const sections = CATEGORY_TYPES
    .map(type => ({ type, groups: props.data.groups.filter(g => g.type === type) }))
    .filter(s => s.groups.length > 0)

  return (
    <div className="space-y-4">
      {sections.map(({ type, groups }) => {
        const planned = groups.reduce((sum, g) => sum + g.availableCents, 0)
        const actual = groups.reduce((sum, g) => sum + g.actualCents, 0)
        const income = !isOutgoing(type)
        return (
          <CollapsibleCard
            key={type}
            id={`budget-${type}`}
            title={t(`categories.type.${type}`)}
            summary={t(income ? 'budget.section_income' : 'budget.section_summary', {
              planned: formatMoney(planned),
              actual: props.future ? '—' : formatMoney(actual),
            })}
          >
            <ListHeader cols={COLS}>
              <div>{t('budget.col_category')}</div>
              <div className="text-right">{t(income ? 'budget.col_expected' : 'budget.col_planned')}</div>
              <div className="text-right">{t(income ? 'budget.col_received' : 'budget.col_spent')}</div>
              <div className="text-right">{t(income ? 'budget.col_to_come' : 'budget.col_left')}</div>
              <div><span className="sr-only">{t('budget.col_progress')}</span></div>
              <div />
            </ListHeader>
            {groups.map(g => <GroupRows key={g.id} group={g} {...props} />)}
          </CollapsibleCard>
        )
      })}
    </div>
  )
}

function GroupRows({ group, future, ...props }: { group: BudgetGroupRow } & BudgetTableProps) {
  return (
    <div role="rowgroup" aria-label={group.name}>
      <div className={cx(COLS, 'h-9 border-b border-line/60 bg-surface-2 text-xs font-semibold text-fg-muted')}>
        <div className="truncate" title={group.name}>{group.name}</div>
        <div className="text-right"><Money cents={group.availableCents} /></div>
        <div className="text-right">{future ? '—' : <Money cents={group.actualCents} />}</div>
        <div className="text-right">{future ? null : <Money cents={group.availableCents - group.actualCents} />}</div>
        <div />
        <div />
      </div>
      {group.categories.map(c => (
        <CategoryRow key={c.id} type={group.type} row={c} future={future} {...props} />
      ))}
    </div>
  )
}

function CategoryRow({ type, row, future, previousLabel, onSetPlanned, onShowTransactions, onSetCarryOver }: {
  type: CategoryType
  row: BudgetCategoryRow
} & Omit<BudgetTableProps, 'data'>) {
  const { t } = useTranslation()
  const income = !isOutgoing(type)
  const unplanned = isUnplanned(type, row)
  const over = !income && row.leftCents < 0
  const lastMonth = roundUpToUnit(row.previousActualCents)
  const spentLabel = t('budget.spent_of', { spent: formatMoney(row.actualCents), available: formatMoney(row.availableCents) })

  return (
    <div id={`budget-row-${row.id}`} className={cx(COLS, 'min-h-12 border-b border-gray-100 py-1.5 last:border-b-0 hover:bg-surface-hover', unplanned && 'bg-warning/40')}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm text-fg" title={row.name}>{row.name}</span>
          {row.archived && <Badge tone="neutral">{t('budget.archived')}</Badge>}
          {unplanned && <Badge tone="warning">{t('budget.not_planned')}</Badge>}
          {row.carryOver && !income && (
            <span className="shrink-0 text-fg-muted" title={t('budget.carry_hint')}>
              <Icon name="repeat" size={12} />
              <span className="sr-only">{t('budget.carry_hint')}</span>
            </span>
          )}
        </div>
        {row.carriedInCents > 0 && (
          <div className="text-xs text-gray-500">{t('budget.carried_in', { amount: formatMoney(row.carriedInCents), month: previousLabel })}</div>
        )}
      </div>
      <div>
        {row.archived
          ? <div className="text-right text-sm"><Money cents={row.plannedCents} /></div>
          : <PlannedCell name={row.name} cents={row.plannedCents} onSave={cents => onSetPlanned(row.id, cents)} />}
        {!row.archived && row.plannedCents === 0 && row.suggestedCents > 0 && (
          // The monthly cost of the category's bills (a yearly charge spread over 12), one click from the plan
          <button
            type="button"
            onClick={() => void onSetPlanned(row.id, row.suggestedCents).catch(() => undefined)}
            title={t('recurring.budget_use_hint', { amount: formatMoney(row.suggestedCents), name: row.name })}
            className="mt-0.5 block w-full truncate text-right text-xs text-gray-500 hover:text-accent"
          >
            {t('recurring.budget_suggested', { amount: formatMoney(row.suggestedCents) })} · <span className="font-medium text-accent">{t('recurring.budget_use')}</span>
          </button>
        )}
      </div>
      <div className="text-right text-sm">{future ? <span className="text-gray-500">—</span> : <Money cents={row.actualCents} />}</div>
      <div className={cx('text-right text-sm', over && 'font-medium text-red-700')}>
        {future ? null : income ? (
          row.leftCents > 0 ? <Money cents={row.leftCents} /> : row.plannedCents > 0 ? <Icon name="check" size={14} className="ml-auto text-success-fg" /> : null
        ) : (
          <span className="inline-flex items-center gap-1" title={over ? t('budget.over_by', { amount: formatMoney(-row.leftCents) }) : undefined}>
            {over && <Icon name="alert-triangle" size={12} />}
            <Money cents={row.leftCents} />
            {over && <span className="sr-only">{t('budget.over_by', { amount: formatMoney(-row.leftCents) })}</span>}
          </span>
        )}
      </div>
      <div>
        {!future && (row.availableCents > 0 || row.actualCents > 0) && (
          <Meter value={row.actualCents} max={row.availableCents} tone={meterTone(row.actualCents, row.availableCents, income)} label={spentLabel} />
        )}
      </div>
      <div>
        <ActionMenu
          label={t('budget.row_more', { name: row.name })}
          items={[
            { id: 'transactions', label: t('budget.action_transactions'), icon: 'receipt', onSelect: () => onShowTransactions(row.id) },
            {
              id: 'last-month',
              label: t('budget.action_last_month', { amount: formatMoney(lastMonth) }),
              icon: 'copy',
              disabled: row.archived || lastMonth === 0 || lastMonth === row.plannedCents,
              reason: row.archived ? t('budget.archived') : lastMonth === 0 ? t('budget.no_last_month') : undefined,
              onSelect: () => void onSetPlanned(row.id, lastMonth).catch(() => undefined),
            },
            ...(income ? [] : [{
              id: 'carry',
              label: t(row.carryOver ? 'budget.action_carry_off' : 'budget.action_carry_on'),
              icon: 'repeat' as const,
              onSelect: () => onSetCarryOver(row.id, !row.carryOver),
            }]),
          ]}
        />
      </div>
    </div>
  )
}
