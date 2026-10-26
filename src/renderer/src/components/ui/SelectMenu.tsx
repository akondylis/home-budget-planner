import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { Popover } from './Popover'
import { cx } from './cx'

export interface SelectMenuOption<T extends string | number> {
  value: T
  label: ReactNode
  /** Text matched by the search box (defaults to the label when it is a string) */
  searchText?: string
  disabled?: boolean
  /** Tooltip, e.g. why the option is disabled */
  hint?: string
}

export interface SelectMenuProps<T extends string | number> {
  value: T | null
  options: SelectMenuOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  /** Trigger text while nothing is chosen */
  placeholder?: ReactNode
  /** Search box above the options, for long lists */
  searchable?: boolean
  panelWidth?: string
  triggerClassName?: string
}

/** Index of the next enabled option from `from` in `step` direction, wrapping; -1 when none is enabled */
export function nextEnabledIndex(options: { disabled?: boolean }[], from: number, step: 1 | -1): number {
  const n = options.length
  for (let i = 1; i <= n; i++) {
    const index = (((from + step * i) % n) + n) % n
    if (!options[index].disabled) return index
  }
  return -1
}

/** Single-choice dropdown in the filter-bar look (same trigger and panel as `MultiSelectDropdown`) */
export function SelectMenu<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
  searchable = false,
  panelWidth,
  triggerClassName = 'min-w-28',
}: SelectMenuProps<T>) {
  const { t } = useTranslation()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(-1)

  const selected = options.find(o => o.value === value)
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const q = fold(query.trim())
  const shown = q
    ? options.filter(o => fold(o.searchText ?? (typeof o.label === 'string' ? o.label : String(o.value))).includes(q))
    : options

  const open = () => {
    setIsOpen(true)
    setHighlighted(options.findIndex(o => o.value === value))
  }
  const close = (refocus = false) => {
    setIsOpen(false)
    setQuery('')
    setHighlighted(-1)
    if (refocus) anchorRef.current?.focus()
  }
  const choose = (option: SelectMenuOption<T>) => {
    if (option.disabled) return
    if (option.value !== value) onChange(option.value)
    close(true)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(prev => nextEnabledIndex(shown, prev < 0 && e.key === 'ArrowUp' ? 0 : prev, e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlighted >= 0 && highlighted < shown.length) choose(shown[highlighted])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={e => {
          if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            open()
          }
        }}
        className={cx('select-field flex items-center gap-1.5 text-left font-medium', triggerClassName)}
      >
        <span className="min-w-0 flex-1 truncate">{selected ? selected.label : placeholder}</span>
        <Icon name="chevron-down" size={16} className={cx('shrink-0 text-gray-500 transition-transform', isOpen && 'rotate-180')} />
      </button>

      <Popover
        open={isOpen}
        anchorRef={anchorRef}
        onClose={() => close()}
        matchWidth
        className={cx('rounded-md border border-line bg-surface shadow-lg', panelWidth)}
      >
        {searchable && (
          <div className="border-b border-line p-2">
            <input
              type="text"
              placeholder={t('app.search')}
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
        )}
        <div
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={searchable ? undefined : -1}
          onKeyDown={searchable ? undefined : handleKeyDown}
          data-autofocus={searchable ? undefined : true}
          className="max-h-72 overflow-y-auto py-1 focus:outline-none"
        >
          {shown.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500">{t('ui.no_results')}</div>
          ) : (
            shown.map((option, index) => {
              const isSelected = option.value === value
              return (
                <div
                  key={String(option.value)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  title={option.hint}
                  onClick={() => choose(option)}
                  onMouseEnter={() => !option.disabled && setHighlighted(index)}
                  className={cx(
                    'flex items-center gap-2 px-3 py-1.5 text-sm transition-colors',
                    option.disabled
                      ? 'cursor-not-allowed text-fg-subtle'
                      : cx('cursor-pointer text-fg', highlighted === index ? 'bg-blue-100' : 'hover:bg-surface-hover'),
                    isSelected && 'font-medium',
                  )}
                >
                  <Icon name="check" size={14} className={cx('shrink-0 text-accent', !isSelected && 'invisible')} />
                  <span className="min-w-0 flex-1">{option.label}</span>
                </div>
              )
            })
          )}
        </div>
      </Popover>
    </>
  )
}
