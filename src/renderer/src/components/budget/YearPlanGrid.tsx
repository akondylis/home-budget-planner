import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { ActionMenu, Badge, ListCard, Money, cx } from '../ui'
import { PlannedCell } from './PlannedCell'
import { formatMoney } from '../../../../shared/money'
import { isOutgoing, type BudgetYear, type YearCategoryRow, type YearGroupRow } from '../../../../shared/budget'
import { CATEGORY_TYPES, type CategoryType } from '../../../../shared/ledger'
import { shortMonthLabel } from '../../lib/budget'
import { monthLabel } from '../../lib/budget-worksheet'

const MONTHS = Array.from({ length: 12 }, (_, i) => i)

// Sticky name and Year columns; the months scroll sideways inside the card
const NAME_CELL = 'sticky left-0 z-[1] w-52 min-w-52 border-r border-line/60 bg-inherit px-3 text-left'
const YEAR_CELL = 'sticky right-0 z-[1] w-28 min-w-28 border-l border-line/60 bg-inherit px-3 text-right'
const MONTH_CELL = 'w-28 min-w-28 px-1 align-top'

export interface YearPlanGridProps {
  data: BudgetYear
  /** Index of this month when the year is the current one, else null */
  currentIndex: number | null
  onSetPlanned: (monthIndex: number, categoryId: string, cents: number) => Promise<void>
  /** Opens that month in Month view */
  onOpenMonth: (monthIndex: number) => void
  /** The log on one month and category */
  onShowMonthTransactions: (monthIndex: number, categoryId: string) => void
  /** The log on every row of one category */
  onShowTransactions: (categoryId: string) => void
  onFillRow: (categoryId: string, cents: number) => void
  onSetCarryOver: (categoryId: string, carryOver: boolean) => void
}

/** 12 months of plans per category, edited in place, with what was spent under each past month */
export function YearPlanGrid(props: YearPlanGridProps) {
  const { t } = useTranslation()
  const sections = CATEGORY_TYPES
    .map(type => ({ type, groups: props.data.groups.filter(g => g.type === type) }))
    .filter(s => s.groups.length > 0)

  return (
    <ListCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{t('budget.year_grid_caption', { year: props.data.year })}</caption>
          {sections.map(({ type, groups }) => (
            <TypeSection key={type} type={type} groups={groups} {...props} />
          ))}
        </table>
      </div>
    </ListCard>
  )
}

function TypeSection({ type, groups, ...props }: { type: CategoryType; groups: YearGroupRow[] } & YearPlanGridProps) {
  const { t, i18n } = useTranslation()
  const income = !isOutgoing(type)
  const planned = groups.reduce((sum, g) => sum + g.plannedCents, 0)
  const actual = groups.reduce((sum, g) => sum + g.actualCents, 0)
  const current = (i: number) => i === props.currentIndex && 'bg-accent/5'

  return (
    <tbody>
      <tr className="bg-surface">
        <th scope="col" className={cx(NAME_CELL, 'h-11 border-b border-line align-bottom pb-2')}>
          <div className="text-sm font-semibold text-fg">{t(`categories.type.${type}`)}</div>
          <div className="text-xs font-normal text-gray-500">
            {t(income ? 'budget.section_income' : 'budget.section_summary', {
              planned: formatMoney(planned),
              actual: props.data.elapsedMonths === 0 ? '—' : formatMoney(actual),
            })}
          </div>
        </th>
        {MONTHS.map(i => (
          <th key={i} scope="col" className={cx(MONTH_CELL, 'border-b border-line pb-2 align-bottom', current(i))}>
            <button
              type="button"
              onClick={() => props.onOpenMonth(i)}
              title={t('budget.year_open_month', { month: monthLabel(new Date(props.data.year, i, 1), i18n.language) })}
              className={cx('w-full rounded px-1 py-0.5 text-right text-xs font-semibold uppercase tracking-wide hover:bg-surface-hover hover:text-accent', i === props.currentIndex ? 'text-accent' : 'text-fg-muted')}
            >
              {shortMonthLabel(i, i18n.language)}
            </button>
          </th>
        ))}
        <th scope="col" className={cx(YEAR_CELL, 'border-b border-line pb-2 align-bottom text-xs font-semibold uppercase tracking-wide text-fg-muted')}>
          {t('budget.year_col_total')}
        </th>
      </tr>
      {groups.map(g => (
        <GroupRows key={g.id} group={g} income={income} current={current} {...props} />
      ))}
    </tbody>
  )
}

function GroupRows({ group, income, current, ...props }: {
  group: YearGroupRow
  income: boolean
  current: (i: number) => string | false
} & YearPlanGridProps) {
  return (
    <>
      <tr className="bg-surface-2 text-xs font-semibold text-fg-muted">
        <th scope="rowgroup" className={cx(NAME_CELL, 'h-8 border-b border-line/60')}>
          <span className="block truncate" title={group.name}>{group.name}</span>
        </th>
        {group.months.map((m, i) => (
          <td key={i} className={cx(MONTH_CELL, 'border-b border-line/60 px-2 align-middle text-right')}>
            {m.plannedCents > 0 && <Money cents={m.plannedCents} />}
          </td>
        ))}
        <td className={cx(YEAR_CELL, 'border-b border-line/60')}><Money cents={group.plannedCents} /></td>
      </tr>
      {group.categories.map(c => (
        <CategoryRow key={c.id} row={c} income={income} current={current} {...props} />
      ))}
    </>
  )
}

function CategoryRow({ row, income, current, data, onSetPlanned, onShowMonthTransactions, onShowTransactions, onFillRow, onSetCarryOver }: {
  row: YearCategoryRow
  income: boolean
  current: (i: number) => string | false
} & YearPlanGridProps) {
  const { t, i18n } = useTranslation()
  // "Fill empty months with": the latest amount planned this year, else the bills' monthly cost
  const fillCents = [...row.months].reverse().find(m => m.plannedCents > 0)?.plannedCents ?? row.suggestedCents

  return (
    <tr className="group bg-surface hover:bg-surface-hover">
      <th scope="row" className={cx(NAME_CELL, 'border-b border-gray-100 py-1.5 align-top font-normal')}>
        <div className="flex min-h-8 items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-sm text-fg" title={row.name}>{row.name}</span>
          {row.archived && <Badge tone="neutral">{t('budget.archived')}</Badge>}
          {row.carries && (
            <span className="shrink-0 text-fg-muted" title={t('budget.carry_hint')}>
              <Icon name="repeat" size={12} />
              <span className="sr-only">{t('budget.carry_hint')}</span>
            </span>
          )}
          <ActionMenu
            label={t('budget.row_more', { name: row.name })}
            items={[
              {
                id: 'fill',
                label: t('budget.year_fill_row', { amount: formatMoney(fillCents) }),
                icon: 'copy',
                disabled: row.archived || fillCents === 0,
                reason: row.archived ? t('budget.archived') : fillCents === 0 ? t('budget.year_fill_row_none') : undefined,
                onSelect: () => onFillRow(row.id, fillCents),
              },
              { id: 'transactions', label: t('budget.year_all_transactions'), icon: 'receipt', onSelect: () => onShowTransactions(row.id) },
              ...(income ? [] : [{
                id: 'carry',
                label: t(row.carryOver ? 'budget.action_carry_off' : 'budget.action_carry_on'),
                icon: 'repeat' as const,
                onSelect: () => onSetCarryOver(row.id, !row.carryOver),
              }]),
            ]}
          />
        </div>
      </th>
      {row.months.map((m, i) => {
        const month = monthLabel(new Date(data.year, i, 1), i18n.language)
        const booked = i < data.elapsedMonths && (m.actualCents !== 0 || m.availableCents > 0)
        const over = !income && m.actualCents > m.availableCents
        const spent = t(income ? 'budget.year_cell_received' : 'budget.year_cell_spent', { amount: formatMoney(m.actualCents), month })
        const title = over ? `${spent} · ${t('budget.over_by', { amount: formatMoney(m.actualCents - m.availableCents) })}` : spent
        return (
          <td key={i} className={cx(MONTH_CELL, 'border-b border-gray-100 py-1.5', current(i))}>
            {row.archived
              ? <div className="flex h-8 items-center justify-end px-1"><Money cents={m.plannedCents} /></div>
              : <PlannedCell name={row.name} label={t('budget.year_planned_for', { name: row.name, month })} column={i} cents={m.plannedCents} onSave={cents => onSetPlanned(i, row.id, cents)} />}
            {booked && (
              <button
                type="button"
                onClick={() => onShowMonthTransactions(i, row.id)}
                title={title}
                aria-label={title}
                className={cx('mt-0.5 flex w-full items-center justify-end gap-0.5 px-1 text-xs tabular-nums hover:underline', over ? 'font-medium text-red-700' : 'text-gray-500')}
              >
                {over && <Icon name="alert-triangle" size={11} />}
                {formatMoney(m.actualCents)}
              </button>
            )}
            {m.carriedInCents > 0 && (
              <div className="px-1 text-right text-xs text-gray-500" title={t('budget.year_carried_in', { amount: formatMoney(m.carriedInCents) })}>
                +{formatMoney(m.carriedInCents)}
              </div>
            )}
          </td>
        )
      })}
      <td className={cx(YEAR_CELL, 'border-b border-gray-100 py-1.5 align-top')}>
        <div className="flex h-8 items-center justify-end font-semibold text-fg"><Money cents={row.plannedCents} /></div>
        {data.elapsedMonths > 0 && (row.actualCents !== 0 || row.plannedCents > 0) && (
          <div className="text-xs text-gray-500" title={t(income ? 'budget.year_received_so_far' : 'budget.year_spent_so_far', { amount: formatMoney(row.actualCents) })}>
            {formatMoney(row.actualCents)}
          </div>
        )}
      </td>
    </tr>
  )
}
