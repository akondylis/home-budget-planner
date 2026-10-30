import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { todayDateOnly } from '../../../../shared/date-only'
import type { AppNotification, NotificationAction } from '../../../../shared/notifications'
import { selectUnreadCount, useNotificationsStore } from '../../store/notifications'
import { groupNotifications } from '../../lib/notifications'
import { Icon } from '../shell/icons'
import { Banner, Button, ConfirmDialog, Popover, cx } from '../ui'
import { NotificationRow } from './NotificationRow'

export interface NotificationCenterProps {
  /** Sidebar is collapsed to icons */
  collapsed: boolean
  /** Sidebar sits on the left, so the panel lines up with the button's left edge */
  isLeft: boolean
  onAction: (action: NotificationAction, notification: AppNotification) => void
}

/** Sidebar bell with the unread count; opens the notification panel (Matchday pattern) */
export function NotificationCenter({ collapsed, isLeft, onAction }: NotificationCenterProps) {
  const { t } = useTranslation()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const items = useNotificationsStore(s => s.items)
  const error = useNotificationsStore(s => s.error)
  const panelOpen = useNotificationsStore(s => s.panelOpen)
  const unread = useNotificationsStore(selectUnreadCount)
  const { refresh, setPanelOpen, markRead, markAllRead, dismiss, dismissAll } = useNotificationsStore.getState()
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const today = todayDateOnly()
  const groups = groupNotifications(items, today)

  const label = t('notifications.title')
  const tooltip = unread > 0 ? t('notifications.tooltip_unread', { count: unread }) : label
  const badge = unread > 9 ? '9+' : String(unread)

  const toggle = () => {
    if (!panelOpen) void refresh()
    setPanelOpen(!panelOpen)
  }

  const handleAction = (action: NotificationAction, n: AppNotification) => {
    void markRead([n.key])
    setPanelOpen(false)
    onAction(action, n)
  }

  const handleClearAll = async () => {
    setClearing(true)
    try {
      await dismissAll()
    } finally {
      setClearing(false)
      setConfirmClear(false)
    }
  }

  return (
    <>
      <button
        ref={anchorRef}
        data-tour="notifications"
        onClick={toggle}
        title={collapsed ? tooltip : undefined}
        aria-label={tooltip}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        className={cx(
          'relative flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm transition-colors duration-150',
          panelOpen ? 'bg-accent/10 font-medium text-accent' : 'text-fg-muted hover:bg-gray-100 hover:text-fg',
        )}
      >
        <Icon name="bell" className="shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
        {unread > 0 && (
          <span
            aria-hidden="true"
            className={cx(
              'rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-[18px] text-white tabular-nums',
              collapsed ? 'absolute right-1 top-0.5 min-w-[18px] text-center' : 'ml-auto',
            )}
          >
            {badge}
          </span>
        )}
      </button>

      <Popover
        open={panelOpen}
        anchorRef={anchorRef}
        onClose={() => setPanelOpen(false)}
        align={isLeft ? 'start' : 'end'}
        className="flex max-h-[min(70vh,560px)] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
      >
        <div role="dialog" aria-label={label} className="flex min-h-0 flex-col">
          {/* Title on its own line, so long (Greek) action labels never squeeze it out */}
          <div className={cx('border-b border-line px-4 pt-3', items.length > 0 ? 'pb-2' : 'pb-3')}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="truncate text-sm font-semibold text-fg">{label}</h2>
              {unread > 0 && (
                <span className="shrink-0 text-xs font-medium text-fg-muted">{t('notifications.unread_count', { count: unread })}</span>
              )}
            </div>
            {/* Nothing to act on in the empty state, so no disabled buttons there */}
            {items.length > 0 && (
              <div className="-ml-2 mt-1 flex flex-wrap gap-1">
                <Button variant="ghost" size="sm" icon="check" onClick={() => void markAllRead()} disabled={unread === 0}>
                  {t('notifications.mark_all_read')}
                </Button>
                <Button variant="ghost" size="sm" icon="close" onClick={() => { setPanelOpen(false); setConfirmClear(true) }}>
                  {t('notifications.clear_all')}
                </Button>
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto">
            {error && (
              <Banner
                tone="warning"
                className="m-3"
                action={<Button variant="ghost" size="sm" icon="refresh" onClick={() => void refresh()}>{t('notifications.retry')}</Button>}
              >
                {t('notifications.load_failed')}
              </Banner>
            )}

            {groups.length === 0 && !error ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-success-fg">
                  <Icon name="check" size={20} />
                </span>
                <div className="text-sm font-medium text-fg">{t('notifications.empty_title')}</div>
                <div className="text-xs text-gray-500">{t('notifications.empty_body')}</div>
              </div>
            ) : (
              groups.map(({ group, items: groupItems }) => (
                <section key={group} aria-label={t(`notifications.group.${group}`)}>
                  <h3 className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t(`notifications.group.${group}`)}
                  </h3>
                  <ul className="divide-y divide-line/60">
                    {groupItems.map(n => (
                      <NotificationRow
                        key={n.key}
                        notification={n}
                        today={today}
                        onAction={action => handleAction(action, n)}
                        onHide={() => void dismiss(n.key)}
                        onMarkRead={() => void markRead([n.key])}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      </Popover>

      {confirmClear && (
        <ConfirmDialog
          title={t('notifications.clear_title')}
          message={t('notifications.clear_body')}
          confirmLabel={t('notifications.clear_confirm')}
          confirmIcon="close"
          loading={clearing}
          onConfirm={() => void handleClearAll()}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </>
  )
}
