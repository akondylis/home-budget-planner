import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/icons'

export interface SectionHeaderProps {
  title: string
  icon?: IconName
  /** Drawn instead of the icon (e.g. a member's colour dot) */
  leading?: ReactNode
  /** Muted text after the title, e.g. "3 accounts" */
  meta?: string
  /** Right-aligned figure for the section, e.g. its subtotal */
  amount?: ReactNode
  as?: 'h2' | 'h3'
}

/** Heading of a group of cards or rows: name and count on the left, its subtotal on the right */
export function SectionHeader({ title, icon, leading, meta, amount, as: Heading = 'h2' }: SectionHeaderProps) {
  return (
    <div className="mb-2 flex items-baseline gap-3 border-b border-line pb-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {leading ?? (icon && <Icon name={icon} size={16} className="shrink-0 self-center text-fg-muted" />)}
        <Heading className="text-sm font-semibold text-fg">{title}</Heading>
        {meta && <span className="whitespace-nowrap text-xs text-fg-muted">{meta}</span>}
      </div>
      {amount !== undefined && <div className="shrink-0 text-sm font-semibold text-fg tabular-nums">{amount}</div>}
    </div>
  )
}
