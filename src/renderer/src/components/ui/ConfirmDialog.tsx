import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { IconName } from '../shell/icons'
import { Button, type ButtonVariant } from './Button'
import { Modal } from './Modal'

export type ConfirmTone = Extract<ButtonVariant, 'primary' | 'danger' | 'success' | 'warning' | 'finalize'>

export interface ConfirmDialogProps {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
  confirmIcon?: IconName
  loading?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Extra body content under the message (e.g. a reason textarea) */
  children?: ReactNode
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  confirmIcon,
  loading = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      closeDisabled={loading}
      bodyClassName="space-y-3 px-6 py-5"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onCancel} disabled={loading}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={tone}
            icon={confirmIcon ?? (tone === 'danger' ? 'trash' : 'check')}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      {message && <div className="text-sm text-gray-700">{message}</div>}
      {children}
    </Modal>
  )
}
