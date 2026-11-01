import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/icons'
import { cx } from './cx'

export type BannerTone = 'warning' | 'success' | 'info' | 'danger'

const TONE_CLASSES: Record<BannerTone, string> = {
  // Required steps still open: strong amber surface with an accent edge
  warning: 'border border-warning-fg/30 border-l-4 border-l-warning-fg bg-warning font-medium text-warning-fg',
  // Requirements met: soft green
  success: 'border border-success-fg/20 bg-success text-success-fg',
  // System notices: muted, no saturated outline
  info: 'border border-transparent bg-neutral text-neutral-fg',
  // Something failed (load, sync, save): red surface with an accent edge
  danger: 'border border-danger-fg/30 border-l-4 border-l-danger-fg bg-danger text-danger-fg',
}

const TONE_ICONS: Record<BannerTone, IconName> = {
  warning: 'alert-triangle',
  success: 'check',
  info: 'info',
  danger: 'x-circle',
}

export interface BannerProps {
  tone: BannerTone
  /** Defaults to the tone's icon; `null` hides it */
  icon?: IconName | null
  /** Bold first line above the text; switches to the block layout */
  title?: ReactNode
  /** Right-aligned action, e.g. a small button */
  action?: ReactNode
  /** Button row under the text (e.g. Confirm / Cancel); switches to the block layout */
  actions?: ReactNode
  className?: string
  children?: ReactNode
}

/** Message strip for warnings (incomplete steps), success (all set), info notices and errors (danger) */
export function Banner({ tone, icon, title, action, actions, className, children }: BannerProps) {
  const iconName = icon === undefined ? TONE_ICONS[tone] : icon
  const block = title !== undefined || actions !== undefined
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(
        'flex gap-2 text-sm',
        block ? 'items-start rounded-lg p-4' : 'items-center rounded-md px-3 py-2',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {iconName && <Icon name={iconName} size={16} className={cx('shrink-0', block && 'mt-0.5')} />}
      <div className="min-w-0 flex-1">
        {title !== undefined && <div className="font-semibold">{title}</div>}
        {children !== undefined && <div className={cx(title !== undefined && 'mt-1')}>{children}</div>}
        {actions !== undefined && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
