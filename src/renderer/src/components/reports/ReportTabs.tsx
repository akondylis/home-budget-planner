import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Icon } from '../shell/icons'
import { LIST_GRID, ListCard, ListHeader, Money, Segmented, cx } from '../ui'
import { BarList } from '../charts/BarList'
import { ColumnChart } from '../charts/ColumnChart'
import { LineChart } from '../charts/LineChart'
import { MemberDot } from '../members/MemberDot'
import { useReportsStore } from '../../store/reports'
import { chartMonthLabel } from '../../lib/chart-scale'
import { monthLabel } from '../../lib/budget-worksheet'
import { monthDate } from '../../lib/budget'
import { formatDate } from '../../lib/date-format'
import { formatMoney } from '../../../../shared/money'
import { HOUSEHOLD, type MemberColour } from '../../../../shared/members'
import {
  sharePercent,
  type BalanceReport,
  type CategoryDirection,
  type CategoryLevel,
  type CategoryReport,
  type CompareMode,
  type DateRange,
  type MemberReport,
  type TrendReport,
  type TrendRow,
} from '../../../../shared/reports'

/** What a click on a report row opens in the log */
export interface ReportRowsFilter {
  range: DateRange
  categoryId?: string
  memberId?: string
  uncategorised?: boolean
}

type Open = (filter: ReportRowsFilter) => void

/** "{amount} more than last year" for the change column */
const changeWords = (t: TFunction, compare: CompareMode) => (deltaCents: number) =>
  t(deltaCents > 0 ? 'reports.change_more' : 'reports.change_less', {
    amount: formatMoney(Math.abs(deltaCents)),
    period: t(`reports.compare_word_${compare}`),
  })

// ── By category ──────────────────────────────────────────────────────────────

export function CategoryTab({ report, onOpen }: { report: CategoryReport; onOpen: Open }) {
  const { t } = useTranslation()
  const compare = useReportsStore(s => s.compare)
  const income = report.direction === 'IN'
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-3">
        <Segmented<CategoryDirection>
          label={t('reports.direction_label')}
          value={report.direction}
          options={[{ value: 'OUT', label: t('reports.direction_OUT') }, { value: 'IN', label: t('reports.direction_IN') }]}
          onChange={d => useReportsStore.getState().setDirection(d)}
        />
        <Segmented<CategoryLevel>
          label={t('reports.level_label')}
          value={report.level}
          options={[{ value: 'CATEGORY', label: t('reports.level_CATEGORY') }, { value: 'GROUP', label: t('reports.level_GROUP') }]}
          onChange={l => useReportsStore.getState().setLevel(l)}
        />
      </div>
      <BarList
        token={income ? 'chart-income' : 'chart-expense'}
        columns={{
          name: t(report.level === 'GROUP' ? 'reports.col_group' : 'reports.col_category'),
          amount: t(income ? 'reports.col_received' : 'reports.col_spent'),
          share: t('reports.col_share'),
          change: report.compare ? t('reports.col_change') : null,
        }}
        changeWords={changeWords(t, compare)}
        rows={report.rows.map(r => ({
          key: r.id ?? 'none',
          name: r.id === null ? (
            <span className="inline-flex items-center gap-1 text-warning-fg">
              <Icon name="alert-triangle" size={12} />
              {t('reports.no_category')}
            </span>
          ) : r.name,
          sub: r.id === null ? t('reports.no_category_hint') : r.groupName,
          cents: r.cents,
          share: sharePercent(r.cents, report.totalCents),
          compareCents: r.compareCents,
          onOpen: () => onOpen(r.id === null ? { range: report.range, uncategorised: true } : { range: report.range, categoryId: r.id }),
        }))}
      />
    </>
  )
}

// ── Month by month ───────────────────────────────────────────────────────────

/** "Mar" / "Q1 26" on the axis, "March 2026" / "Q1 2026" in the table */
function trendLabels(r: TrendRow, lang: string): { short: string; long: string } {
  if (r.key.includes('Q')) {
    const [y, q] = r.key.split('-')
    return { short: `${q} ${y.slice(2)}`, long: `${q} ${y}` }
  }
  return { short: chartMonthLabel(r.key, lang), long: monthLabel(monthDate(r.key), lang) }
}

const TREND_COLS = cx(LIST_GRID, 'grid-cols-[minmax(0,1fr)_8rem_8rem_9rem_5rem]')

export function TrendTab({ report, onOpen }: { report: TrendReport; onOpen: Open }) {
  const { t, i18n } = useTranslation()
  const totals = report.rows.reduce((s, r) => ({ in: s.in + r.inCents, out: s.out + r.outCents }), { in: 0, out: 0 })
  return (
    <>
      <ListCard className="mb-4 px-4 py-4">
        <h2 className="mb-2 text-sm font-semibold text-fg">
          {t(report.by === 'QUARTER' ? 'reports.trend_title_quarter' : 'reports.trend_title')}
        </h2>
        <ColumnChart
          series={[{ label: t('reports.col_in'), token: 'chart-income' }, { label: t('reports.col_out'), token: 'chart-expense' }]}
          groups={report.rows.map(r => ({
            label: trendLabels(r, i18n.language).short,
            title: trendLabels(r, i18n.language).long,
            values: [r.inCents, r.outCents],
            details: [{ label: t('reports.col_net'), cents: r.netCents }],
          }))}
          ariaLabel={t('reports.trend_label', { in: formatMoney(totals.in), out: formatMoney(totals.out) })}
          onSelect={i => onOpen({ range: report.rows[i].range })}
        />
      </ListCard>
      <ListCard>
        <ListHeader cols={TREND_COLS}>
          <div>{t(report.by === 'QUARTER' ? 'reports.col_quarter' : 'reports.col_month')}</div>
          <div className="text-right">{t('reports.col_in')}</div>
          <div className="text-right">{t('reports.col_out')}</div>
          <div className="text-right">{t('reports.col_net')}</div>
          <div className="text-right">{t('reports.col_rows')}</div>
        </ListHeader>
        {report.rows.map(r => {
          const over = r.netCents < 0
          return (
            <div key={r.key} className={cx(TREND_COLS, 'min-h-11 border-b border-gray-100 py-1.5 text-sm last:border-b-0 hover:bg-surface-hover')}>
              <button type="button" onClick={() => onOpen({ range: r.range })} title={t('reports.open_rows')} className="truncate text-left font-medium text-fg hover:text-accent hover:underline">
                {trendLabels(r, i18n.language).long}
              </button>
              <div className="text-right">{r.inCents > 0 ? <Money cents={r.inCents} signed /> : <span className="text-gray-500">—</span>}</div>
              <div className="text-right">{r.outCents > 0 ? <Money cents={0 - r.outCents} /> : <span className="text-gray-500">—</span>}</div>
              <div className={cx('text-right font-semibold', over ? 'text-red-700' : 'text-fg')}>
                <span className="inline-flex items-center gap-1">
                  {over && <Icon name="alert-triangle" size={12} />}
                  <Money cents={r.netCents} signed />
                </span>
                {over && <div className="text-xs font-medium">{t('reports.overspent')}</div>}
              </div>
              <div className="text-right text-fg-muted tabular-nums">{r.count}</div>
            </div>
          )
        })}
      </ListCard>
    </>
  )
}

// ── By member ────────────────────────────────────────────────────────────────

export function MemberTab({ report, onOpen }: { report: MemberReport; onOpen: Open }) {
  const { t } = useTranslation()
  const compare = useReportsStore(s => s.compare)
  return (
    <BarList
      token="chart-expense"
      columns={{ name: t('reports.col_member'), amount: t('reports.col_spent'), share: t('reports.col_share'), change: report.compare ? t('reports.col_change') : null }}
      changeWords={changeWords(t, compare)}
      rows={report.rows.map(r => ({
        key: r.id,
        name: r.id === HOUSEHOLD ? t('members.household') : (r.name ?? ''),
        leading: r.colour ? <MemberDot colour={r.colour as MemberColour} /> : <Icon name="users" size={12} className="shrink-0 text-fg-muted" />,
        cents: r.cents,
        share: sharePercent(r.cents, report.totalCents),
        compareCents: r.compareCents,
        onOpen: () => onOpen({ range: report.range, memberId: r.id }),
        details: r.top.length > 0 ? (
          <ul className="space-y-1 px-12 pt-1 text-sm">
            {r.top.map(c => (
              <li key={c.id ?? 'none'} className="flex justify-between gap-4">
                <span className="truncate text-fg-muted">{c.id === null ? t('reports.no_category') : c.name}</span>
                <Money cents={c.cents} />
              </li>
            ))}
          </ul>
        ) : undefined,
      }))}
    />
  )
}

// ── Balances ─────────────────────────────────────────────────────────────────

const BALANCE_COLS = cx(LIST_GRID, 'grid-cols-[minmax(0,1fr)_9rem_9rem_9rem]')

export function BalanceTab({ report }: { report: BalanceReport }) {
  const { t, i18n } = useTranslation()
  const end = report.points.at(-1)?.cents ?? report.startCents
  const spendable = report.accounts.filter(a => a.spendable)
  const vouchers = report.accounts.filter(a => !a.spendable)
  return (
    <>
      <ListCard className="mb-4 px-4 py-4">
        <h2 className="mb-2 text-sm font-semibold text-fg">{t('reports.balance_title')}</h2>
        <LineChart
          points={[
            { label: t('reports.balance_start'), title: t('reports.balance_start_title', { date: formatDate(report.range.from) }), cents: report.startCents },
            ...report.points.map(p => ({
              label: chartMonthLabel(p.month, i18n.language),
              title: t('reports.balance_month_end', { month: monthLabel(monthDate(p.month), i18n.language) }),
              cents: p.cents,
            })),
          ]}
          ariaLabel={t('reports.balance_label', { start: formatMoney(report.startCents), end: formatMoney(end) })}
          belowZeroLabel={t('projections.below_zero')}
        />
      </ListCard>
      <ListCard>
        <ListHeader cols={BALANCE_COLS}>
          <div>{t('reports.col_account')}</div>
          <div className="text-right">{t('reports.col_start')}</div>
          <div className="text-right">{t('reports.col_end')}</div>
          <div className="text-right">{t('reports.col_change')}</div>
        </ListHeader>
        {spendable.map(a => <BalanceRow key={a.id} name={a.name} archived={a.archived} start={a.startCents} end={a.endCents} />)}
        <BalanceRow name={t('reports.balance_total')} start={report.startCents} end={end} bold />
        {vouchers.length > 0 && (
          <>
            <div className="border-b border-line/60 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-fg-muted">{t('reports.balance_vouchers')}</div>
            {vouchers.map(a => <BalanceRow key={a.id} name={a.name} archived={a.archived} start={a.startCents} end={a.endCents} />)}
          </>
        )}
      </ListCard>
    </>
  )
}

function BalanceRow({ name, archived = false, start, end, bold = false }: { name: string; archived?: boolean; start: number; end: number; bold?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={cx(BALANCE_COLS, 'min-h-11 border-b border-gray-100 py-1.5 text-sm last:border-b-0', bold && 'bg-surface-2/60 font-semibold')}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-fg" title={name}>{name}</span>
        {archived && <span className="text-xs text-gray-500">{t('reports.archived')}</span>}
      </div>
      <div className="text-right"><Money cents={start} /></div>
      <div className="text-right"><Money cents={end} /></div>
      <div className="text-right"><Money cents={end - start} signed /></div>
    </div>
  )
}
