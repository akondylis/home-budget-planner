import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { useUiStore } from '../../store/ui'
import { cx } from './cx'
import { ListCard } from './List'

export interface CollapsibleCardProps {
  /** Key of the remembered open/closed state (`ui` store, `collapsedSections`) */
  id: string
  /** Controlled mode: the parent owns the open state (the store is not used) */
  open?: boolean
  onToggle?: () => void
  title: string
  /** Key numbers shown next to the title, so a folded card still gives the overview */
  summary?: ReactNode
  /** Controls beside the title (toggles, filters); shown only while open */
  actions?: ReactNode
  className?: string
  children: ReactNode
}

/** A card whose body folds away; the body is unmounted while folded, so heavy charts and tables cost nothing */
export function CollapsibleCard({ id, title, summary, actions, open, onToggle, className, children }: CollapsibleCardProps) {
  const { t } = useTranslation()
  const storedCollapsed = useUiStore(s => s.collapsedSections.includes(id))
  const toggleStored = useUiStore(s => s.toggleSection)
  const collapsed = open === undefined ? storedCollapsed : !open
  const bodyId = useId()

  return (
    <ListCard className={className}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          title={t(collapsed ? 'ui.expand' : 'ui.collapse')}
          onClick={() => (onToggle ? onToggle() : toggleStored(id))}
          className="-mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
        >
          <Icon name="chevron-down" size={16} className={cx('shrink-0 text-fg-muted transition-transform', collapsed && '-rotate-90')} />
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {summary && <span className="text-xs text-fg-muted">{summary}</span>}
        </button>
        {!collapsed && actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {!collapsed && <div id={bodyId}>{children}</div>}
    </ListCard>
  )
}
