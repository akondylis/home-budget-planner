import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/icons'
import { cx } from './cx'

export type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral' | 'info' | 'orange' | 'purple'

export interface BadgeProps {
  tone?: BadgeTone
  icon?: IconName
  title?: string
  className?: string
  children: ReactNode
}

export function Badge({ tone = 'neutral', icon, title, className, children }: BadgeProps) {
  return (
    <span title={title} className={cx('badge', `badge-${tone}`, className)}>
      {icon && <Icon name={icon} size={12} className="shrink-0" />}
      {children}
    </span>
  )
}
