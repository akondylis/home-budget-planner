import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Money, Popover, cx, type ActionMenuItem } from '../ui'
import { PaymentChip } from './PaymentChip'
import { formatDate } from '../../lib/date-format'
import { billKey, isIncome, isOpen, totalsOf } from '../../lib/payment-calendar'
import { addDays } from '../../../../shared/date-only'
import { monthOf, monthWeeks, weekStart, weekdayNames, type WeekStart } from '../../../../shared/calendar-grid'
import type { UpcomingBill } from '../../../../shared/recurrence'

/** Chips a day cell shows before "+N more" */
const MAX_CHIPS = 3

const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

export interface MonthGridProps {
  /** 'yyyy-MM' */
  month: string
  today: string
  firstDay: WeekStart
  byDay: Map<string, UpcomingBill[]>
  actionsFor: (bill: UpcomingBill) => ActionMenuItem[]
  /** Arrow keys crossed into another month */
  onMonthChange: (month: string) => void
}

/**
 * Month grid starting on the household's first day of the week, with a Week column for
 * what is still due that week. Each day shows its due total and its items; a busy day
 * folds the rest into "+N more". Arrow keys move between days (roving focus), across
 * months too; Enter goes into the day's first item.
 */
export function MonthGrid({ month, today, firstDay, byDay, actionsFor, onMonthChange }: MonthGridProps) {
  const { t, i18n } = useTranslation()
  const weeks = monthWeeks(month, firstDay)
  const [focusDay, setFocusDay] = useState(() => (monthOf(today) === month ? today : `${month}-01`))
  const gridRef = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  const names = weekdayNames(i18n.language === 'en' ? 'en-GB' : 'el-GR', firstDay)
  const longNames = weekdayNames(i18n.language === 'en' ? 'en-GB' : 'el-GR', firstDay, 'long')

  // A new month (buttons or keys) keeps the focused day inside it
  useEffect(() => {
    if (monthOf(focusDay) !== month) setFocusDay(monthOf(today) === month ? today : `${month}-01`)
  }, [month])

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus()
  }, [focusDay, month])

  function handleKey(e: KeyboardEvent<HTMLDivElement>, day: string) {
    if (e.target !== e.currentTarget) return
    let next: string | null = null
    const step = KEY_STEPS[e.key]
    if (step) next = addDays(day, step)
    else if (e.key === 'Home') next = weekStart(day, firstDay)
    else if (e.key === 'End') next = addDays(weekStart(day, firstDay), 6)
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.currentTarget.querySelector<HTMLElement>('button')?.focus()
      return
    }
    if (!next) return
    e.preventDefault()
    moved.current = true
    setFocusDay(next)
    if (monthOf(next) !== month) onMonthChange(monthOf(next))
  }

  return (
    <div ref={gridRef} role="grid" aria-label={t('calendar.view_month')} className="overflow-hidden rounded-lg border border-line bg-surface">
      <div role="row" className="calendar-cols border-b border-line bg-surface-2">
        {names.map((name, i) => (
          <div key={name} role="columnheader" aria-label={longNames[i]} className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
            {name}
          </div>
        ))}
        <div role="columnheader" className="px-2 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">{t('calendar.week')}</div>
      </div>
      {weeks.map(week => {
        const weekTotals = totalsOf(week.flatMap(d => byDay.get(d) ?? []))
        return (
          <div key={week[0]} role="row" className="calendar-cols border-b border-line last:border-b-0">
            {week.map(day => (
              <DayCell
                key={day}
                day={day}
                inMonth={monthOf(day) === month}
                isToday={day === today}
                focused={day === focusDay}
                items={byDay.get(day) ?? []}
                actionsFor={actionsFor}
                onFocus={() => setFocusDay(day)}
                onKeyDown={e => handleKey(e, day)}
              />
            ))}
            <div role="gridcell" className="flex flex-col items-end gap-0.5 border-l border-line bg-surface-2 px-2 py-1.5 text-xs">
              {weekTotals.dueOut !== 0 && (
                <span className="font-semibold text-fg" title={t('calendar.week_due')}><Money cents={weekTotals.dueOut} signed /></span>
              )}
              {weekTotals.expectedIn !== 0 && (
                <span className="text-fg-muted" title={t('calendar.week_in')}><Money cents={weekTotals.expectedIn} signed /></span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface DayCellProps {
  day: string
  inMonth: boolean
  isToday: boolean
  focused: boolean
  items: UpcomingBill[]
  actionsFor: (bill: UpcomingBill) => ActionMenuItem[]
  onFocus: () => void
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
}

function DayCell({ day, inMonth, isToday, focused, items, actionsFor, onFocus, onKeyDown }: DayCellProps) {
  const { t } = useTranslation()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const shown = items.length > MAX_CHIPS ? items.slice(0, MAX_CHIPS - 1) : items
  const rest = items.length - shown.length
  // A day total only adds something over its chips when two or more are still due
  const due = items.filter(b => !isIncome(b) && isOpen(b)).length > 1 ? totalsOf(items).dueOut : 0
  const label = [formatDate(day), items.length > 0 ? t('calendar.items', { count: items.length }) : null].filter(Boolean).join(', ')

  return (
    <div
      role="gridcell"
      data-day={day}
      tabIndex={focused ? 0 : -1}
      aria-label={label}
      aria-current={isToday ? 'date' : undefined}
      onFocus={e => { if (e.target === e.currentTarget) onFocus() }}
      onKeyDown={onKeyDown}
      className={cx(
        'flex min-h-24 min-w-0 flex-col gap-1 border-l border-line p-1.5 first:border-l-0 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent',
        !inMonth && 'bg-surface-2/60',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cx(
            'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums',
            isToday ? 'bg-accent font-semibold text-white' : inMonth ? 'text-fg' : 'text-gray-500',
          )}
        >
          {Number(day.slice(8, 10))}
        </span>
        {due !== 0 && <span className="text-xs font-medium text-fg-muted" title={t('calendar.day_due')}><Money cents={due} signed /></span>}
      </div>
      {shown.map(bill => <PaymentChip key={billKey(bill)} bill={bill} actions={actionsFor(bill)} />)}
      {rest > 0 && (
        <>
          <button
            ref={moreRef}
            type="button"
            onClick={() => setMoreOpen(o => !o)}
            aria-expanded={moreOpen}
            className="rounded px-1.5 text-left text-xs font-medium text-accent hover:underline"
          >
            {t('calendar.more', { count: rest })}
          </button>
          <Popover open={moreOpen} anchorRef={moreRef} onClose={() => setMoreOpen(false)} className="w-64 rounded-md border border-line bg-surface p-2 shadow-lg">
            <div className="mb-1.5 text-xs font-semibold text-fg">{formatDate(day)}</div>
            <div className="flex flex-col gap-1">
              {items.map(bill => <PaymentChip key={billKey(bill)} bill={bill} actions={actionsFor(bill)} />)}
            </div>
          </Popover>
        </>
      )}
    </div>
  )
}
