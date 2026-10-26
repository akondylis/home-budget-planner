import type { ReactNode } from 'react'
import { cx } from './cx'

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Beside the title: the screen's "?" Help link (`HelpLink`) */
  help?: ReactNode
  /** Right-aligned; one primary action per view */
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, help, actions, className = 'mb-6' }: PageHeaderProps) {
  return (
    <div className={cx('flex items-center justify-between gap-4', className)}>
      <div className="min-w-0">
        {help ? (
          <div className="flex min-w-0 items-center gap-1">
            <h1 className="page-title truncate">{title}</h1>
            {help}
          </div>
        ) : (
          <h1 className="page-title truncate">{title}</h1>
        )}
        {subtitle && <div className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
