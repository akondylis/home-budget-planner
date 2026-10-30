import { useTranslation } from 'react-i18next'
import type { AppNotification, NotificationAction } from '../../../../shared/notifications'
import { notificationText } from '../../../../shared/notification-text'
import { ACTION_ICONS, KIND_ICONS, actionLabel, kindTone } from '../../lib/notifications'
import { Icon } from '../shell/icons'
import { ActionMenu, Button, IconButton, cx } from '../ui'

export interface NotificationRowProps {
  notification: AppNotification
  today: string
  onAction: (action: NotificationAction) => void
  onHide: () => void
  onMarkRead: () => void
}

/** Unread dot · icon + title · detail (amount, date, how late) · main action, the rest in "…" · hide */
export function NotificationRow({ notification: n, today, onAction, onHide, onMarkRead }: NotificationRowProps) {
  const { t } = useTranslation()
  const { title, detail } = notificationText(n, today, (key, params) => t(key, params))
  const [main, ...rest] = n.actions

  return (
    // A click anywhere on the row marks it read; the buttons inside do their own thing too
    <li onClick={onMarkRead} className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-hover">
      <span aria-hidden="true" className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-blue-600')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className={cx('flex min-w-0 items-start gap-1.5 text-sm text-fg', n.read ? 'font-medium' : 'font-semibold')}>
            <Icon name={KIND_ICONS[n.kind]} size={14} className={cx('mt-0.5 shrink-0', kindTone(n))} />
            <span className="min-w-0 break-words">
              {!n.read && <span className="sr-only">{t('notifications.unread_count', { count: 1 })}: </span>}
              {title}
            </span>
          </div>
          <IconButton
            icon="close"
            size="sm"
            label={t('notifications.hide')}
            onClick={e => { e.stopPropagation(); onHide() }}
            className="-mr-1 -mt-1"
          />
        </div>
        <p className="mt-0.5 text-xs tabular-nums text-fg-muted">{detail}</p>
        {main && (
          <div className="mt-2 flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <Button size="sm" icon={ACTION_ICONS[main.kind]} onClick={() => onAction(main)}>
              {actionLabel(main, n, t)}
            </Button>
            {rest.length > 0 && (
              <ActionMenu
                label={t('notifications.more_actions')}
                items={rest.map(action => ({
                  id: action.kind,
                  label: actionLabel(action, n, t),
                  icon: ACTION_ICONS[action.kind],
                  onSelect: () => onAction(action),
                }))}
              />
            )}
          </div>
        )}
      </div>
    </li>
  )
}
