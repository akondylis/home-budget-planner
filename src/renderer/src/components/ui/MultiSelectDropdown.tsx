import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { Popover } from './Popover'
import { cx } from './cx'

export interface MultiSelectDropdownProps<T> {
  /** Trigger text, e.g. "All" or "3 selected" */
  label: ReactNode
  items: T[]
  getId: (item: T) => string
  renderItem: (item: T) => ReactNode
  matches: (item: T, query: string) => boolean
  isSelected: (id: string) => boolean
  onToggle: (id: string) => void
  searchPlaceholder?: string
  /** Actions under the list; `close` closes the panel */
  footer?: (close: () => void) => ReactNode
  /** Panel width */
  panelWidth?: string
  triggerClassName?: string
}

/** Filter-bar checklist with search, portaled so scroll containers can't clip it */
export function MultiSelectDropdown<T>({
  label,
  items,
  getId,
  renderItem,
  matches,
  isSelected,
  onToggle,
  searchPlaceholder,
  footer,
  panelWidth = 'w-96',
  triggerClassName = 'min-w-[220px]',
}: MultiSelectDropdownProps<T>) {
  const { t } = useTranslation()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(-1)

  const close = () => {
    setIsOpen(false)
    setQuery('')
    setHighlighted(-1)
  }

  const filtered = query.trim() ? items.filter(item => matches(item, query)) : items

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(prev => (prev < filtered.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(prev => (prev > 0 ? prev - 1 : filtered.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlighted >= 0 && highlighted < filtered.length) onToggle(getId(filtered[highlighted]))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      anchorRef.current?.focus()
    }
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        className={cx('select-field flex items-center gap-1.5 text-left font-medium', triggerClassName)}
      >
        <span className="truncate">{label}</span>
        <Icon
          name="chevron-down"
          size={16}
          className={cx('ml-auto shrink-0 text-gray-500 transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      <Popover
        open={isOpen}
        anchorRef={anchorRef}
        onClose={close}
        className={cx('rounded-md border border-line bg-surface shadow-lg', panelWidth)}
      >
        <div className="border-b border-line p-2">
          <input
            type="text"
            placeholder={searchPlaceholder ?? t('app.search')}
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setHighlighted(-1)
            }}
            onKeyDown={handleKeyDown}
            className="input-field h-8 w-full text-xs"
            data-autofocus
          />
        </div>

        <div role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500">{t('ui.no_results')}</div>
          ) : (
            filtered.map((item, index) => {
              const id = getId(item)
              return (
                <label
                  key={id}
                  className={cx(
                    'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs transition-colors',
                    highlighted === index ? 'bg-blue-100' : 'hover:bg-surface-hover',
                  )}
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseLeave={() => setHighlighted(-1)}
                >
                  <input type="checkbox" checked={isSelected(id)} onChange={() => onToggle(id)} className="cursor-pointer" />
                  <span className="min-w-0 flex-1">{renderItem(item)}</span>
                </label>
              )
            })
          )}
        </div>

        {footer && <div className="flex justify-end gap-2 border-t border-line p-2">{footer(close)}</div>}
      </Popover>
    </>
  )
}
