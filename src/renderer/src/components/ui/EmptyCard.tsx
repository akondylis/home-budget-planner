import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/icons'
import { ListCard } from './List'

export interface EmptyCardProps {
  icon: IconName
  title: string
  /** What happened and the next step */
  body: string
  /** The way out, e.g. Clear filters */
  children?: ReactNode
}

/** Designed empty state: icon, title, the next step and its button */
export function EmptyCard({ icon, title, body, children }: EmptyCardProps) {
  return (
    <ListCard className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
        <Icon name={icon} size={24} />
      </span>
      <h2 className="mt-4 text-sm font-semibold text-fg">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-fg-muted">{body}</p>
      {children && <div className="mt-4 flex gap-2">{children}</div>}
    </ListCard>
  )
}
