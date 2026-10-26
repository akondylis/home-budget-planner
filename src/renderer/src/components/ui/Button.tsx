import type { ButtonHTMLAttributes, Ref } from 'react'
import { Icon, type IconName } from '../shell/icons'
import { Spinner } from './Spinner'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'finalize'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  success: 'btn-success',
  warning: 'btn-warning',
  finalize: 'btn-finalize',
}

const SIZE_CLASSES: Record<ButtonSize, string | undefined> = {
  sm: 'btn-sm',
  md: undefined,
  lg: 'btn-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Leading icon; replaced by a spinner while loading */
  icon?: IconName
  /** Shows a spinner and disables the button */
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const iconSize = size === 'sm' ? 14 : 16
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : icon && <Icon name={icon} size={iconSize} className="shrink-0" />}
      {children}
    </button>
  )
}
