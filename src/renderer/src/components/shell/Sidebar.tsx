import { useTranslation } from 'react-i18next'
import { useUiStore } from '../../store/ui'
import { toggleSidebar } from '../../lib/ui-actions'
import { useSidebarResize } from '../../hooks/useSidebarResize'
import type { View } from '../../types'
import { Icon } from './icons'
import { Badge, HoverCard } from '../ui'
import { MemberSwitcher } from '../members/MemberSwitcher'
import { NotificationCenter } from '../notifications/NotificationCenter'
import type { AppNotification, NotificationAction } from '../../../../shared/notifications'
import { FOOTER_NAV_ITEMS, MAIN_NAV_ITEMS, type NavItem } from '../../lib/nav-items'

function isActive(item: NavItem, view: View): boolean {
  // The Categories page belongs to Transactions
  return item.id === view || (view === 'categories' && item.id === 'transactions')
}

export interface SidebarProps {
  view: View
  onNavigate: (target: NavItem['id']) => void
  onNotificationAction: (action: NotificationAction, notification: AppNotification) => void
}

export function Sidebar({ view, onNavigate, onNotificationAction }: SidebarProps) {
  const { t } = useTranslation()
  const collapsed = useUiStore(s => s.sidebarCollapsed)
  const position = useUiStore(s => s.sidebarPosition)
  const isLeft = position === 'left'
  const { width, dragging, handleProps } = useSidebarResize(isLeft)

  function renderItem(item: NavItem) {
    const active = isActive(item, view)
    const label = t(item.labelKey)
    return (
      <HoverCard key={item.id} enabled={collapsed} focusable={false} side="beside" widthClassName="w-64" content={<NavCard item={item} />}>
      <button
        data-tour={item.id}
        onClick={() => onNavigate(item.id)}
        aria-label={collapsed ? label : undefined}
        aria-current={active ? 'page' : undefined}
        className={`relative flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm transition-colors duration-150 ${
          active
            ? 'bg-accent/10 font-medium text-accent'
            : 'text-fg-muted hover:bg-gray-100 hover:text-fg'
        }`}
      >
        {active && (
          <span
            aria-hidden="true"
            className={`absolute inset-y-2 w-0.5 rounded-full bg-accent ${isLeft ? '-right-2' : '-left-2'}`}
          />
        )}
        <Icon name={item.icon} className="shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </button>
      </HoverCard>
    )
  }

  return (
    <nav
      aria-label={t('shell.nav_label')}
      // Expanded width is set by the user, so it is computed at runtime
      style={collapsed ? undefined : { width }}
      className={`relative flex shrink-0 flex-col gap-1 overflow-clip border-line bg-glass/70 p-2 backdrop-blur-xl ${
        dragging ? '' : 'transition-[width] duration-200 ease-out motion-reduce:transition-none'
      } ${isLeft ? 'border-r' : 'border-l'} ${collapsed ? 'w-14' : ''}`}
    >
      <div
        {...handleProps}
        aria-label={t('shell.resize_sidebar')}
        title={t('shell.resize_sidebar')}
        className={`absolute inset-y-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-none ${
          isLeft ? 'right-0' : 'left-0'
        } ${dragging ? 'bg-accent/40' : ''}`}
      />

      {MAIN_NAV_ITEMS.map(renderItem)}

      <div className="mt-auto flex flex-col gap-1 border-t border-line pt-2">
        <NotificationCenter collapsed={collapsed} isLeft={isLeft} onAction={onNotificationAction} />
        <MemberSwitcher collapsed={collapsed} onManage={() => onNavigate('settings')} />
        {FOOTER_NAV_ITEMS.map(renderItem)}
        <button
          onClick={toggleSidebar}
          title={`${t(collapsed ? 'shell.expand_sidebar' : 'shell.collapse_sidebar')} (Ctrl+\\)`}
          aria-label={t(collapsed ? 'shell.expand_sidebar' : 'shell.collapse_sidebar')}
          aria-expanded={!collapsed}
          className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm text-fg-muted transition-colors hover:bg-gray-100 hover:text-fg"
        >
          <Icon name="sidebar" className={`shrink-0 ${isLeft ? '' : '-scale-x-100'}`} />
          {!collapsed && <span className="truncate">{t('shell.collapse_sidebar')}</span>}
        </button>
      </div>
    </nav>
  )
}

/** Collapsed sidebar: the page's name and, for areas not built yet, what they will do */
function NavCard({ item }: { item: NavItem }) {
  const { t, i18n } = useTranslation()
  const plannedKey = `planned.${item.id}`
  const planned = i18n.exists(plannedKey)
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-fg">{t(item.labelKey)}</span>
        {planned && <Badge tone="neutral" className="whitespace-nowrap">{t('planned.title')}</Badge>}
      </div>
      {planned && <p className="mt-1 text-xs text-fg-muted">{t(plannedKey)}</p>}
    </>
  )
}
