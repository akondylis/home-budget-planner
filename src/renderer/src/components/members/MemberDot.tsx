import { cx } from '../ui'
import { MEMBER_DOT_CLASS } from '../../lib/members'
import type { MemberColour } from '../../../../shared/members'

export interface MemberDotProps {
  colour: MemberColour
  /** Shown next to the dot; the colour is never the only way to tell members apart */
  name?: string
  size?: 'sm' | 'md'
  className?: string
}

/** A member's colour dot, with their name when given */
export function MemberDot({ colour, name, size = 'sm', className }: MemberDotProps) {
  const dot = (
    <span
      aria-hidden="true"
      className={cx('inline-block shrink-0 rounded-full', size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5', MEMBER_DOT_CLASS[colour])}
    />
  )
  if (!name) return <span className={className}>{dot}</span>
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5', className)}>
      {dot}
      <span className="truncate">{name}</span>
    </span>
  )
}
