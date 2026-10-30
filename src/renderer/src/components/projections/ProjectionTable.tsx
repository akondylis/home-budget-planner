import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { Badge, IconButton, LIST_GRID, ListCard, ListHeader, Money, cx } from '../ui'
import type { Projection, ProjectionMonth } from '../../../../shared/projection'
import { monthLabel } from '../../lib/budget-worksheet'
import { monthDate } from '../../lib/budget'

const COLS = cx(LIST_GRID, 'grid-cols-[2rem_minmax(0,1fr)_8rem_8rem_10rem]')

export interface ProjectionTableProps {
  data: Projection
  onOpenBudget: (month: string) => void
}

/** Month · in · out · balance at month end; each month opens to the categories behind it */
export function ProjectionTable({ data, onOpenBudget }: ProjectionTableProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ListCard>
      <ListHeader cols={COLS}>
        <div />
        <div>{t('projections.col_month')}</div>
        <div className="text-right">{t('projections.col_in')}</div>
        <div className="text-right">{t('projections.col_out')}</div>
        <div className="text-right">{t('projections.col_end')}</div>
      </ListHeader>
      {data.months.map((m, i) => (
        <MonthRows
          key={m.month}
          month={m}
          current={i === 0}
          open={open === m.month}
          onToggle={() => setOpen(open === m.month ? null : m.month)}
          onOpenBudget={() => onOpenBudget(m.month)}
        />
      ))}
    </ListCard>
  )
}

function MonthRows({ month, current, open, onToggle, onOpenBudget }: {
  month: ProjectionMonth
  current: boolean
  open: boolean
  onToggle: () => void
  onOpenBudget: () => void
}) {
  const { t, i18n } = useTranslation()
  const name = monthLabel(monthDate(month.month), i18n.language)
  const below = month.endCents < 0
  const repeated = month.planMonth !== null && month.planMonth !== month.month
  const detailsId = `projection-${month.month}`

  return (
    <div role="rowgroup" aria-label={name} className="border-b border-gray-100 last:border-b-0">
      <div className={cx(COLS, 'min-h-12 py-1.5 hover:bg-surface-hover')}>
        <div>
          <IconButton
            icon={open ? 'chevron-down' : 'chevron-right'}
            label={t(open ? 'projections.hide_details' : 'projections.show_details', { month: name })}
            aria-expanded={open}
            aria-controls={detailsId}
            disabled={month.lines.length === 0}
            onClick={onToggle}
          />
        </div>
        <div className="min-w-0">
          <button
            type="button"
            onClick={onOpenBudget}
            title={t('projections.open_budget_of', { month: name })}
            className="truncate text-left text-sm font-medium text-fg hover:text-accent hover:underline"
          >
            {name}
          </button>
          <div className="truncate text-xs text-gray-500">
            {current
              ? t('projections.rest_of_month')
              : repeated
                ? t('projections.plan_of', { month: monthLabel(monthDate(month.planMonth!), i18n.language) })
                : month.planMonth === null && t('projections.no_plan')}
          </div>
        </div>
        <div className="text-right text-sm">{month.inCents > 0 ? <Money cents={month.inCents} signed /> : <span className="text-gray-500">—</span>}</div>
        <div className="text-right text-sm">{month.outCents > 0 ? <Money cents={0 - month.outCents} /> : <span className="text-gray-500">—</span>}</div>
        <div className={cx('text-right text-sm font-semibold', below ? 'text-red-700' : 'text-fg')}>
          <span className="inline-flex items-center gap-1">
            {below && <Icon name="alert-triangle" size={12} />}
            <Money cents={month.endCents} />
          </span>
          {below && <div className="text-xs font-medium">{t('projections.below_zero')}</div>}
        </div>
      </div>
      {open && (
        <div id={detailsId} className="bg-surface-2/60 pb-2">
          {month.lines.map(l => (
            <div key={l.categoryId} className={cx(COLS, 'min-h-9 py-1 text-sm')}>
              <div />
              <div className="flex min-w-0 items-center gap-2 pl-3">
                <span className="truncate text-fg" title={l.name}>{l.name}</span>
                <Badge tone={l.source === 'PLAN' ? 'neutral' : 'info'}>{t(`projections.source_${l.source}`)}</Badge>
                {l.ruleNames.length > 0 && (
                  <span className="truncate text-xs text-gray-500" title={l.ruleNames.join(', ')}>{l.ruleNames.join(', ')}</span>
                )}
              </div>
              <div className="text-right">{l.amountCents > 0 && <Money cents={l.amountCents} signed />}</div>
              <div className="text-right">{l.amountCents < 0 && <Money cents={l.amountCents} />}</div>
              <div />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
