import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/icons'
import { cx } from './cx'

export interface StatTileProps {
  label: string
  /** The headline value, e.g. `<Money cents={…} />` */
  value: ReactNode
  icon?: IconName
  /** Muted context under the value ("12 transactions", "vs €1.200 planned") */
  hint?: ReactNode
  className?: string
}

/** KPI tile: muted label → large value in text ink (never a series colour) → muted hint */
export function StatTile({ label, value, icon, hint, className }: StatTileProps) {
  return (
    <div className={cx('card px-4 py-3', className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        {icon && <Icon name={icon} size={14} className="shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-gray-500">{hint}</div>}
    </div>
  )
}
