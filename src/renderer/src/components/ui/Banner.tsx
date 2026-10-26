import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/icons'
import { cx } from './cx'

export type BannerTone = 'warning' | 'success' | 'info'

const TONE_CLASSES: Record<BannerTone, string> = {
  // Required steps still open: strong amber surface with an accent edge
  warning: 'border border-warning-fg/30 border-l-4 border-l-warning-fg bg-warning font-medium text-warning-fg',
  // Requirements met: soft green
  success: 'border border-success-fg/20 bg-success text-success-fg',
  // System notices: muted, no saturated outline
  info: 'border border-transparent bg-neutral text-neutral-fg',
}

const TONE_ICONS: Record<BannerTone, IconName> = {
  warning: 'alert-triangle',
  success: 'check',
  info: 'info',
}

export interface BannerProps {
  tone: BannerTone
  /** Defaults to the tone's icon; `null` hides it */
  icon?: IconName | null
  /** Right-aligned action, e.g. a small button */
  action?: ReactNode
  className?: string
  children: ReactNode
}

/** Message strip for warnings (incomplete steps), success (all set) and info notices */
export function Banner({ tone, icon, action, className, children }: BannerProps) {
  const iconName = icon === undefined ? TONE_ICONS[tone] : icon
  return (
    <div
      role="status"
      className={cx('flex items-center gap-2 rounded-md px-3 py-2 text-sm', TONE_CLASSES[tone], className)}
    >
      {iconName && <Icon name={iconName} size={16} className="shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
