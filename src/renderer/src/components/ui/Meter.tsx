import { cx } from './cx'

export type MeterTone = 'accent' | 'warning' | 'danger' | 'income'

// The fill carries the state; the track is a lighter step of the same ramp, so it reads across the whole bar
const TONE_CLASSES: Record<MeterTone, { fill: string; track: string }> = {
  accent: { fill: 'bg-blue-600', track: 'bg-blue-100' },
  warning: { fill: 'bg-amber-500', track: 'bg-amber-100' },
  danger: { fill: 'bg-red-600', track: 'bg-red-100' },
  income: { fill: 'bg-chart-income', track: 'bg-chart-income/20' },
}

export interface MeterProps {
  value: number
  /** 0 = nothing to measure against: a full bar when there is a value, empty otherwise */
  max: number
  tone?: MeterTone
  /** Spoken name with the figures, e.g. "€120 of €400"; the state is said in text next to the meter, never by colour alone */
  label: string
  className?: string
}

/** A thin ratio bar (spent of planned); the value past `max` keeps the bar full */
export function Meter({ value, max, tone = 'accent', label, className }: MeterProps) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : value > 0 ? 1 : 0
  const classes = TONE_CLASSES[tone]
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(max, value, 1)}
      aria-valuenow={Math.max(value, 0)}
      title={label}
      className={cx('h-1.5 w-full overflow-hidden rounded-full', classes.track, className)}
    >
      {/* Width is a runtime value */}
      <div className={cx('h-full rounded-full', classes.fill)} style={{ width: `${ratio * 100}%` }} />
    </div>
  )
}
