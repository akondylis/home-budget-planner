import { useTranslation } from 'react-i18next'
import type { IconName } from '../shell/icons'
import type { ReactNode } from 'react'
import { Badge, type BadgeTone } from './Badge'
import type { PaymentStatus } from '../../../../shared/recurrence'

/** The one look for anything still in draft or only planned (budget drafts, planned transactions) */
export const DRAFT_TONE: BadgeTone = 'warning'
export const DRAFT_ICON: IconName = 'pencil'

export type { PaymentStatus }

export const PAYMENT_STATUS_KEYS: Record<PaymentStatus, string> = {
  UPCOMING: 'status.upcoming',
  DUE: 'status.due',
  OVERDUE: 'status.overdue',
  PAID: 'status.paid',
  SKIPPED: 'status.skipped',
}

export const PAYMENT_STATUS_ICONS: Record<PaymentStatus, IconName> = {
  UPCOMING: 'calendar',
  DUE: 'bell',
  OVERDUE: 'alert-triangle',
  PAID: 'check',
  SKIPPED: 'minus',
}

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, BadgeTone> = {
  UPCOMING: 'info',
  DUE: 'warning',
  OVERDUE: 'danger',
  PAID: 'success',
  SKIPPED: 'neutral',
}

export interface StatusProps {
  status: PaymentStatus
}

/** Draft pill: the draft tone and icon with a context-specific label */
export function DraftBadge({ title, children }: { title?: string; children: ReactNode }) {
  return <Badge tone={DRAFT_TONE} icon={DRAFT_ICON} title={title}>{children}</Badge>
}

/** Payment status pill: tone, icon and text, never colour alone */
export function StatusBadge({ status }: StatusProps) {
  const { t } = useTranslation()
  return (
    <Badge tone={PAYMENT_STATUS_TONES[status] ?? 'neutral'} icon={PAYMENT_STATUS_ICONS[status]}>
      {t(PAYMENT_STATUS_KEYS[status] ?? status)}
    </Badge>
  )
}
