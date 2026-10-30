import { useTranslation } from 'react-i18next'
import { Button, IconButton } from '../ui'
import { monthLabel } from '../../lib/budget-worksheet'
import { monthDate } from '../../lib/budget'

interface PeriodSwitcherProps {
  label: string
  prevLabel: string
  nextLabel: string
  /** Shown away from today's period */
  todayLabel: string | null
  onChange: (delta: number) => void
  onToday: () => void
}

/** ‹ label › with a way back to today's period; PageUp / PageDown do the same on the page */
function PeriodSwitcher({ label, prevLabel, nextLabel, todayLabel, onChange, onToday }: PeriodSwitcherProps) {
  return (
    <div className="flex items-center gap-1">
      <IconButton icon="arrow-left" label={`${prevLabel} (PageUp)`} onClick={() => onChange(-1)} />
      <span className="min-w-36 text-center text-sm font-semibold text-fg" aria-live="polite">{label}</span>
      <IconButton icon="arrow-right" label={`${nextLabel} (PageDown)`} onClick={() => onChange(1)} />
      {todayLabel && <Button size="sm" variant="ghost" icon="calendar" onClick={onToday}>{todayLabel}</Button>}
    </div>
  )
}

export interface MonthSwitcherProps {
  /** 'yyyy-MM' */
  month: string
  current: string
  onChange: (delta: number) => void
  onToday: () => void
}

/** ‹ October 2026 › */
export function MonthSwitcher({ month, current, onChange, onToday }: MonthSwitcherProps) {
  const { t, i18n } = useTranslation()
  return (
    <PeriodSwitcher
      label={monthLabel(monthDate(month), i18n.language)}
      prevLabel={t('budget.prev_month')}
      nextLabel={t('budget.next_month')}
      todayLabel={month !== current ? t('budget.this_month') : null}
      onChange={onChange}
      onToday={onToday}
    />
  )
}

export interface YearSwitcherProps {
  year: number
  current: number
  onChange: (delta: number) => void
  onToday: () => void
}

/** ‹ 2026 › */
export function YearSwitcher({ year, current, onChange, onToday }: YearSwitcherProps) {
  const { t } = useTranslation()
  return (
    <PeriodSwitcher
      label={String(year)}
      prevLabel={t('budget.prev_year')}
      nextLabel={t('budget.next_year')}
      todayLabel={year !== current ? t('budget.this_year') : null}
      onChange={onChange}
      onToday={onToday}
    />
  )
}
