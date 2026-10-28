import { useTranslation } from 'react-i18next'
import { Button, IconButton } from '../ui'
import { monthLabel } from '../../lib/budget-worksheet'
import { monthDate } from '../../lib/budget'

export interface MonthSwitcherProps {
  /** 'yyyy-MM' */
  month: string
  current: string
  onChange: (delta: number) => void
  onToday: () => void
}

/** ‹ October 2026 › with a way back to this month; PageUp / PageDown do the same on the page */
export function MonthSwitcher({ month, current, onChange, onToday }: MonthSwitcherProps) {
  const { t, i18n } = useTranslation()
  return (
    <div className="flex items-center gap-1">
      <IconButton icon="arrow-left" label={`${t('budget.prev_month')} (PageUp)`} onClick={() => onChange(-1)} />
      <span className="min-w-36 text-center text-sm font-semibold text-fg" aria-live="polite">
        {monthLabel(monthDate(month), i18n.language)}
      </span>
      <IconButton icon="arrow-right" label={`${t('budget.next_month')} (PageDown)`} onClick={() => onChange(1)} />
      {month !== current && (
        <Button size="sm" variant="ghost" icon="calendar" onClick={onToday}>{t('budget.this_month')}</Button>
      )}
    </div>
  )
}
