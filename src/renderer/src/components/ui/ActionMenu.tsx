import { useRef, useState } from 'react'
import { IconButton } from './IconButton'
import { MenuList, type ActionMenuItem } from './MenuList'
import { Popover } from './Popover'

export type { ActionMenuItem } from './MenuList'

export interface ActionMenuProps {
  /** Translated label of the "…" button (tooltip + aria-label), e.g. "More for Fuel" */
  label: string
  items: ActionMenuItem[]
  size?: 'sm' | 'md'
}

/** "More" button with a short list of row actions; ↑/↓ move, Enter runs, Esc closes */
export function ActionMenu({ label, items, size = 'sm' }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <IconButton
        ref={anchorRef}
        icon="more-vertical"
        size={size}
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      />
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} align="end">
        <MenuList label={label} items={items} onClose={() => setOpen(false)} />
      </Popover>
    </>
  )
}
