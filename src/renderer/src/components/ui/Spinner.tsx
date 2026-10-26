import { Icon } from '../shell/icons'
import { cx } from './cx'

export interface SpinnerProps {
  size?: number
  className?: string
}

export function Spinner({ size = 16, className }: SpinnerProps) {
  return <Icon name="spinner" size={size} className={cx('shrink-0 animate-spin', className)} />
}
