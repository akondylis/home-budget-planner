import type { ReactNode } from 'react'
import { Icon } from '../shell/icons'
import { ListCard } from '../ui'

/** Centred empty card of the Budget page: what is missing, and the ways to start */
export function BudgetEmptyState({ title, body, actions }: { title: string; body: string; actions: ReactNode }) {
  return (
    <ListCard className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Icon name="target" size={24} />
      </span>
      <h2 className="mt-4 text-sm font-semibold text-fg">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-fg-muted">{body}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>
    </ListCard>
  )
}
