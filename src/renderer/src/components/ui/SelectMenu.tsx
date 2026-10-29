import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { Popover } from './Popover'
import { cx } from './cx'
import { normalise } from '../../../../shared/search-normalise'

export interface SelectMenuOption<T extends string | number> {
  value: T
  label: ReactNode
  /** Text matched by the search box (defaults to the label when it is a string) */
  searchText?: string
  disabled?: boolean
  /** Tooltip, e.g. why the option is disabled */
  hint?: string
  /** `heading` is a section title over the options that follow it, never chosen */
  kind?: 'option' | 'heading'
  /** Selectable option that opens a section (bold, divider above), e.g. "All in Bills" */
  emphasis?: boolean
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
  /** `compact` rows (text-xs) for dropdowns inside dense tables */
  density?: 'default' | 'compact'
  /** Offers "Create «query»" under the list when the search finds no exact match (needs `searchable`) */
  onCreate?: (query: string) => void
  /** Text of that row, e.g. `Create «Οπωροπωλείο»` */
  createLabel?: (query: string) => ReactNode
}

const isChoosable = (o: { disabled?: boolean; kind?: string }) => !o.disabled && o.kind !== 'heading'

/** Index of the next enabled option from `from` in `step` direction, wrapping; -1 when none is enabled */
export function nextEnabledIndex(options: { disabled?: boolean; kind?: string }[], from: number, step: 1 | -1): number {
  const n = options.length
  for (let i = 1; i <= n; i++) {
    const index = (((from + step * i) % n) + n) % n
    if (isChoosable(options[index])) return index
  }
  return -1
}

/**
 * Options matching the search query; a heading stays while any option under it matches.
 * Accent-, case- and script-insensitive: "souper" finds "Σούπερ μάρκετ"
 */
export function visibleOptions<T extends string | number>(options: SelectMenuOption<T>[], query: string): SelectMenuOption<T>[] {
  const q = normalise(query)
  if (!q) return options
  const shown: SelectMenuOption<T>[] = []
  let heading: SelectMenuOption<T> | null = null
  for (const o of options) {
    if (o.kind === 'heading') {
      heading = o
      continue
    }
    if (!normalise(o.searchText ?? (typeof o.label === 'string' ? o.label : String(o.value))).includes(q)) continue
    if (heading) shown.push(heading)
    heading = null
    shown.push(o)
  }
  return shown
}

const optionName = <T extends string | number>(o: SelectMenuOption<T>) =>
  typeof o.label === 'string' ? o.label : o.searchText ?? String(o.value)

/** Whether to offer "Create «query»": a query that names no option exactly (accent- and case-insensitive) */
export function showCreate<T extends string | number>(options: SelectMenuOption<T>[], query: string): boolean {
  const q = normalise(query.trim())
  return q !== '' && !options.some(o => o.kind !== 'heading' && normalise(optionName(o)) === q)
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
  density = 'default',
  onCreate,
  createLabel,
}: SelectMenuProps<T>) {
  const { t } = useTranslation()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value && o.kind !== 'heading')
  const shown = visibleOptions(options, query)
  const compact = density === 'compact'
  const creatable = searchable && onCreate !== undefined && showCreate(options, query)
  // The create row sits after the options and takes part in arrow-key navigation
  const createIndex = creatable ? shown.length : -1
  const navigable = creatable ? [...shown, { kind: 'option' as const }] : shown

  // Open on the current choice, not at the top of a long list
  useEffect(() => {
    if (!isOpen) return
    const frame = requestAnimationFrame(() =>
      listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' }),
    )
    return () => cancelAnimationFrame(frame)
  }, [isOpen])

  // Keep the highlighted row in view while the arrow keys walk the list (held keys too);
  // the first option of a section brings its heading along
  useEffect(() => {
    if (!isOpen || highlighted < 0) return
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)
    const heading = row?.previousElementSibling
    ;(heading?.getAttribute('role') === 'presentation' ? heading : row)?.scrollIntoView({ block: 'nearest' })
    row?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, highlighted])

  const open = () => {
    setIsOpen(true)
    setHighlighted(options.findIndex(o => o.value === value && isChoosable(o)))
  }
  const close = (refocus = false) => {
    setIsOpen(false)
    setQuery('')
    setHighlighted(-1)
    if (refocus) anchorRef.current?.focus()
  }
  const choose = (option: SelectMenuOption<T>) => {
    if (!isChoosable(option)) return
    if (option.value !== value) onChange(option.value)
    close(true)
  }

  const create = () => {
    const name = query.trim()
    close()
    onCreate?.(name)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(prev => nextEnabledIndex(navigable, prev < 0 && e.key === 'ArrowUp' ? 0 : prev, e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlighted === createIndex && creatable) create()
      else if (highlighted >= 0 && highlighted < shown.length) choose(shown[highlighted])
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
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={searchable ? undefined : -1}
          onKeyDown={searchable ? undefined : handleKeyDown}
          data-autofocus={searchable ? undefined : true}
          className="max-h-72 overflow-y-auto py-1 focus:outline-none"
        >
          {shown.length === 0 && !creatable ? (
            <div className="px-3 py-2 text-xs text-gray-500">{t('ui.no_results')}</div>
          ) : (
            shown.map((option, index) => {
              const divider = index > 0 && 'mt-1 border-t border-line'
              if (option.kind === 'heading') {
                return (
                  <div key={`heading-${String(option.value)}`} role="presentation" className={cx('menu-heading', divider)}>
                    {option.label}
                  </div>
                )
              }
              const isSelected = option.value === value
              return (
                <div
                  key={String(option.value)}
                  role="option"
                  data-index={index}
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  title={option.hint}
                  onClick={() => choose(option)}
                  // Move, not enter: the list scrolling under a resting pointer must not steal the highlight
                  onMouseMove={() => !option.disabled && highlighted !== index && setHighlighted(index)}
                  className={cx(
                    'flex items-center gap-2 px-3 transition-colors',
                    compact ? 'py-1 text-xs' : 'py-1.5 text-sm',
                    option.emphasis && cx('font-medium', divider),
                    option.disabled
                      ? 'cursor-not-allowed text-fg-subtle'
                      : cx('cursor-pointer text-fg', highlighted === index ? 'bg-blue-100' : 'hover:bg-surface-hover'),
                    isSelected && 'font-medium',
                  )}
                >
                  <Icon name="check" size={compact ? 12 : 14} className={cx('shrink-0 text-accent', !isSelected && 'invisible')} />
                  <span className="min-w-0 flex-1">{option.label}</span>
                </div>
              )
            })
          )}
          {creatable && (
            <div
              role="option"
              aria-selected={false}
              data-index={createIndex}
              onClick={create}
              onMouseMove={() => highlighted !== createIndex && setHighlighted(createIndex)}
              className={cx(
                'flex cursor-pointer items-center gap-2 px-3 font-medium text-accent transition-colors',
                compact ? 'py-1 text-xs' : 'py-1.5 text-sm',
                shown.length > 0 && 'mt-1 border-t border-line',
                highlighted === createIndex ? 'bg-blue-100' : 'hover:bg-surface-hover',
              )}
            >
              <Icon name="plus" size={compact ? 12 : 14} className="shrink-0" />
              <span className="min-w-0 flex-1 break-words">{createLabel ? createLabel(query.trim()) : query.trim()}</span>
            </div>
          )}
        </div>
      </Popover>
    </>
  )
}
