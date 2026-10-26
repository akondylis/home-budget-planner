import type { ButtonHTMLAttributes, Ref } from 'react'
import { Icon, type IconName } from '../shell/icons'
import { Spinner } from './Spinner'
import { cx } from './cx'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName
  /** Translated text for the tooltip and screen readers */
  label: string
  variant?: 'default' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
  /** Toggle buttons: on shows the accent colour and sets aria-pressed */
  pressed?: boolean
  ref?: Ref<HTMLButtonElement>
}

/** Ghost square icon button (never a filled block) */
export function IconButton({
  icon,
  label,
  variant = 'default',
  size = 'md',
  loading = false,
  pressed,
  disabled,
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  const iconSize = size === 'sm' ? 14 : 16
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      className={cx('btn-icon', size === 'sm' && 'btn-icon-sm', variant === 'danger' && 'btn-icon-danger', pressed && 'btn-icon-pressed', className)}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : <Icon name={icon} size={iconSize} />}
    </button>
  )
}
