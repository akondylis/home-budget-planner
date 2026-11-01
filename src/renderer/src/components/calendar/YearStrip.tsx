import { useTranslation } from 'react-i18next'
import { Badge, Money, cx } from '../ui'
import { formatDate } from '../../lib/date-format'
import type { YearMonth, YearSummary } from '../../lib/payment-calendar'
import { monthOf } from '../../../../shared/calendar-grid'

export interface YearStripProps {
  summary: YearSummary
  today: string
  /** Opens that month in the Month view */
  onOpenMonth: (month: string) => void
}

/**
 * Twelve month tiles: money out vs money in as two thin bars on one scale (chart-expense /
 * chart-income tokens, each with its amount and label, so never colour alone), how many
 * bills are still to pay and the pay days. The heaviest month is marked.
 */
export function YearStrip({ summary, today, onOpenMonth }: YearStripProps) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-fg-muted" aria-hidden="true">
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-chart-expense" />{t('calendar.out')}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-chart-income" />{t('calendar.in')}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {summary.months.map(m => (
          <MonthTile
            key={m.month}
            month={m}
            scale={summary.scale}
            heaviest={m.month === summary.heaviest}
            current={m.month === monthOf(today)}
            onOpen={() => onOpenMonth(m.month)}
          />
        ))}
      </div>
    </div>
  )
}

interface MonthTileProps {
  month: YearMonth
  scale: number
  heaviest: boolean
  current: boolean
  onOpen: () => void
}

function MonthTile({ month, scale, heaviest, current, onOpen }: MonthTileProps) {
  const { t, i18n } = useTranslation()
  // The month part of "month year" is the nominative in Greek ("Οκτώβριος", not "Οκτωβρίου")
  const name = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'el-GR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .formatToParts(new Date(`${month.month}-01T00:00:00Z`))
    .find(p => p.type === 'month')?.value ?? month.month
  const label = name.charAt(0).toLocaleUpperCase(i18n.language) + name.slice(1)
  const width = (cents: number) => (scale > 0 ? `${Math.max(Math.abs(cents) / scale * 100, cents === 0 ? 0 : 2)}%` : '0%')
  const empty = month.out === 0 && month.in === 0

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('calendar.open_month', { month: label })}
      className={cx(
        'flex flex-col gap-2 rounded-lg border bg-surface p-3 text-left hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
        current ? 'border-accent' : 'border-line',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-sm font-semibold text-fg">{label}</span>
        <span className="flex flex-wrap gap-1">
          {heaviest && <Badge tone="warning" icon="trending-up">{t('calendar.heaviest')}</Badge>}
          {month.overdueCount > 0 && <Badge tone="danger" icon="alert-triangle">{t('calendar.overdue_count', { count: month.overdueCount })}</Badge>}
        </span>
      </div>
      {empty ? (
        <p className="text-xs text-fg-muted">{t('calendar.month_nothing')}</p>
      ) : (
        <>
          <Bar label={t('calendar.out')} cents={month.out} width={width(month.out)} tone="bg-chart-expense" />
          <Bar label={t('calendar.in')} cents={month.in} width={width(month.in)} tone="bg-chart-income" />
          <div className="text-xs text-fg-muted">
            {month.unpaidCount > 0 ? t('calendar.unpaid_count', { count: month.unpaidCount }) : month.out !== 0 ? t('calendar.all_paid') : null}
            {month.payDays.length > 0 && (
              <div className="mt-0.5">{t('calendar.pay_days', { days: month.payDays.map(d => formatDate(d)).join(', ') })}</div>
            )}
          </div>
        </>
      )}
    </button>
  )
}

function Bar({ label, cents, width, tone }: { label: string; cents: number; width: string; tone: string }) {
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs" title={label}>
      <span className="text-fg-muted">{label}</span>
      <span className="h-2 rounded-r bg-surface-2">
        {/* Width is the month's share of the year's largest month, computed at runtime */}
        <span className={cx('block h-2 rounded-r', tone)} style={{ width }} />
      </span>
      <span className="text-right font-medium text-fg"><Money cents={cents} signed /></span>
    </div>
  )
}
