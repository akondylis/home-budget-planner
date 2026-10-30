import { useRef, type ReactNode } from 'react'
import { MenuList, type ActionMenuItem } from './MenuList'
import { Popover } from './Popover'

export interface ContextMenuProps {
  /** Where the menu opens (window coordinates, e.g. the right-click); null = closed */
  point: { x: number; y: number } | null
  /** Translated name of the menu (aria-label) */
  label: string
  /** Optional line over the items, e.g. "3 selected" */
  heading?: ReactNode
  items: ActionMenuItem[]
  onClose: () => void
  /** Shown in place of the items: a second step such as a picker */
  children?: ReactNode
}

/**
 * Right-click menu at the pointer: the same items and keys as `ActionMenu`.
 * A shortcut only: every action in it must also be reachable without it.
 */
export function ContextMenu({ point, label, heading, items, onClose, children }: ContextMenuProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  return (
    <>
      {/* Zero-size anchor at the pointer; its position is only known at runtime */}
      {point && <span ref={anchorRef} aria-hidden className="pointer-events-none fixed h-0 w-0" style={{ left: point.x, top: point.y }} />}
      <Popover open={point !== null} anchorRef={anchorRef} onClose={onClose}>
        {heading && <div className="menu-heading border-b border-line">{heading}</div>}
        {children ?? <MenuList label={label} items={items} onClose={onClose} />}
      </Popover>
    </>
  )
}
