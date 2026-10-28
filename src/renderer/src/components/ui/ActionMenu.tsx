import { useRef, useState, type KeyboardEvent } from 'react'
import { Icon, type IconName } from '../shell/icons'
import { IconButton } from './IconButton'
import { Popover } from './Popover'
import { cx } from './cx'

export interface ActionMenuItem {
  id: string
  label: string
  icon: IconName
  onSelect: () => void
  /** Destructive actions are drawn in red */
  danger?: boolean
  disabled?: boolean
  /** Why it is disabled, shown on hover and under the label */
  reason?: string
}

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
  const listRef = useRef<HTMLDivElement>(null)
  const firstEnabled = items.findIndex(i => !i.disabled)

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

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
        <div ref={listRef} role="menu" aria-label={label} className="min-w-48 py-1" onKeyDown={onKeyDown}>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.disabled ? item.reason : undefined}
              data-autofocus={index === firstEnabled || undefined}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={cx(
                'flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm focus:bg-surface-2 focus:outline-none enabled:hover:bg-surface-2 disabled:cursor-not-allowed',
                item.danger ? 'text-red-700' : 'text-fg',
                item.disabled && 'text-fg-muted',
              )}
            >
              <Icon name={item.icon} size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0">
                {item.label}
                {item.disabled && item.reason && <span className="block text-xs text-gray-500">{item.reason}</span>}
              </span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}
