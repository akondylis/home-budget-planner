import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { CollapsibleCard, LIST_GRID, ListHeader, Money, cx } from '../ui'
import { formatMoney } from '../../../../shared/money'
import { isOutgoing, type BudgetYear, type YearCategoryRow, type YearGroupRow } from '../../../../shared/budget'
import { CATEGORY_TYPES } from '../../../../shared/ledger'
import { yearChange } from '../../lib/budget'

const COLS = cx(LIST_GRID, 'grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_10rem_7.5rem]')

type Figures = Pick<YearCategoryRow, 'thisYearCents' | 'lastYearCents' | 'lastYearFullCents'>

const used = (f: Figures) => f.thisYearCents !== 0 || f.lastYearCents !== 0 || f.lastYearFullCents !== 0

/** This year so far against the same dates last year, per category (read-only) */
export function YearCompareTable({ data }: { data: BudgetYear }) {
  const { t } = useTranslation()
  const sections = CATEGORY_TYPES
    .map(type => ({ type, groups: data.groups.filter(g => g.type === type && used(g)) }))
    .filter(s => s.groups.length > 0)

  return (
    <div className="space-y-4">
      {sections.map(({ type, groups }) => {
        const income = !isOutgoing(type)
        return (
          <CollapsibleCard key={type} id={`budget-year-compare-${type}`} title={t(`categories.type.${type}`)}>
            <ListHeader cols={COLS}>
              <div>{t('budget.col_category')}</div>
              <div className="text-right">{t('budget.year_col_this', { year: data.year })}</div>
              <div className="text-right">{t('budget.year_col_last', { year: data.year - 1 })}</div>
              <div className="text-right">{t('budget.year_col_change')}</div>
              <div className="text-right">{t('budget.year_col_last_full', { year: data.year - 1 })}</div>
            </ListHeader>
            {groups.map(g => <GroupRows key={g.id} group={g} income={income} />)}
          </CollapsibleCard>
        )
      })}
    </div>
  )
}

function GroupRows({ group, income }: { group: YearGroupRow; income: boolean }) {
  return (
    <div role="rowgroup" aria-label={group.name}>
      <Row name={group.name} figures={group} income={income} heading />
      {group.categories.filter(used).map(c => <Row key={c.id} name={c.name} figures={c} income={income} />)}
    </div>
  )
}

function Row({ name, figures, income, heading = false }: { name: string; figures: Figures; income: boolean; heading?: boolean }) {
  return (
    <div className={cx(COLS, heading
      ? 'h-9 border-b border-line/60 bg-surface-2 text-xs font-semibold text-fg-muted'
      : 'min-h-11 border-b border-gray-100 py-1.5 text-sm last:border-b-0 hover:bg-surface-hover')}
    >
      <div className={cx('truncate', !heading && 'text-fg')} title={name}>{name}</div>
      <div className="text-right"><Money cents={figures.thisYearCents} /></div>
      <div className="text-right"><Money cents={figures.lastYearCents} /></div>
      <div className="text-right"><Change thisCents={figures.thisYearCents} lastCents={figures.lastYearCents} income={income} /></div>
      <div className="text-right text-gray-500"><Money cents={figures.lastYearFullCents} /></div>
    </div>
  )
}

/** ↑ +€120 · +12 %, with the words for screen readers; colour never carries the meaning alone */
function Change({ thisCents, lastCents, income }: { thisCents: number; lastCents: number; income: boolean }) {
  const { t, i18n } = useTranslation()
  const { deltaCents, percent } = yearChange(thisCents, lastCents)
  if (deltaCents === 0) return <span className="text-gray-500">{t('budget.year_same')}</span>
  const up = deltaCents > 0
  const words = t(up ? (income ? 'budget.year_more_in' : 'budget.year_more_out') : (income ? 'budget.year_less_in' : 'budget.year_less_out'), {
    amount: formatMoney(Math.abs(deltaCents)),
  })
  return (
    <span className="inline-flex items-center justify-end gap-1 tabular-nums" title={words}>
      <Icon name={up ? 'arrow-up' : 'arrow-down'} size={12} className="shrink-0 text-fg-muted" />
      <span>{formatMoney(deltaCents, { sign: 'always' })}</span>
      {percent !== null && <span className="text-xs text-gray-500">{formatPercent(percent, i18n.language)}</span>}
      <span className="sr-only">{words}</span>
    </span>
  )
}

/** +12 % / −5 % in the app language */
function formatPercent(percent: number, lang: string): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'el-GR', { style: 'percent', signDisplay: 'exceptZero' }).format(percent / 100)
}
