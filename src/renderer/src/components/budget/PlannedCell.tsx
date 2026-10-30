import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { Input, cx } from '../ui'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { parsePlanned, plannedText } from '../../lib/budget'

export interface PlannedCellProps {
  /** Category name, for the input's label */
  name: string
  cents: number
  onSave: (cents: number) => Promise<void>
  /** Accessible label instead of "Planned for {name}" (the year grid names the month too) */
  label?: string
  /** Column in a grid (the year view): ↑/↓/Enter stay in the column, ←/→ move along the row */
  column?: number
}

/**
 * Every Planned input on the page, in reading order, for ↑/↓ and Enter; in a grid,
 * `sameColumn` keeps to the inputs of the cell's own column.
 */
function moveFocus(from: HTMLInputElement, delta: 1 | -1, sameColumn = true) {
  let cells = [...document.querySelectorAll<HTMLInputElement>('input[data-planned-cell]')]
  const col = from.dataset.plannedCol
  if (sameColumn && col !== undefined) cells = cells.filter(c => c.dataset.plannedCol === col)
  const next = cells[cells.indexOf(from) + delta]
  if (next) {
    next.focus()
    next.select()
  }
}

/** Inline planned amount: saves on Enter or when focus leaves, Esc puts the saved amount back */
export function PlannedCell({ name, cents, onSave, label, column }: PlannedCellProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(plannedText(cents))
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Follow the stored amount (another month, a copy) unless the user is typing
  useEffect(() => {
    if (!focused) setText(plannedText(cents))
  }, [cents, focused])

  useEffect(() => () => clearTimeout(savedTimer.current), [])

  async function commit() {
    const parsed = parsePlanned(text)
    if (!parsed.ok) {
      setError(t(`budget.error_${parsed.error}`))
      return
    }
    setError(null)
    if (parsed.cents === cents) {
      setText(plannedText(cents))
      return
    }
    try {
      await onSave(parsed.cents)
      setText(plannedText(parsed.cents))
      setSaved(true)
      clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      setError(ipcErrorMessage(err, t))
      setText(plannedText(cents))
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const input = e.currentTarget
    if (e.key === 'Enter') {
      e.preventDefault()
      void commit()
      // A bad amount keeps the focus here, next to its error
      if (parsePlanned(text).ok) moveFocus(input, e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setText(plannedText(cents))
      setError(null)
      input.blur()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      moveFocus(input, e.key === 'ArrowDown' ? 1 : -1)
    } else if (column !== undefined && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      // Along the row only when the caret is at that edge, or the whole amount is selected
      const { selectionStart: start, selectionEnd: end, value } = input
      const all = start === 0 && end === value.length
      const atEdge = e.key === 'ArrowLeft' ? start === 0 && end === 0 : start === value.length
      if (!all && !atEdge) return
      e.preventDefault()
      moveFocus(input, e.key === 'ArrowRight' ? 1 : -1, false)
    }
  }

  return (
    <div className="min-w-0">
      <div className="relative">
        <Input
          data-planned-cell
          data-planned-col={column}
          inputMode="decimal"
          value={text}
          placeholder="0"
          aria-label={label ?? t('budget.planned_for', { name })}
          aria-invalid={error ? true : undefined}
          onChange={e => setText(e.target.value)}
          onFocus={e => { setFocused(true); e.currentTarget.select() }}
          onBlur={() => { setFocused(false); void commit() }}
          onKeyDown={onKeyDown}
          className={cx('h-8 w-full min-w-0 text-right tabular-nums', column === undefined ? 'pr-6' : 'pl-2 pr-5', error && 'border-red-500')}
        />
        {saved && (
          <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-success-fg" title={t('budget.saved')}>
            <Icon name="check" size={14} />
            <span className="sr-only">{t('budget.saved')}</span>
          </span>
        )}
      </div>
      {error && <div role="alert" className="mt-0.5 text-xs text-red-700">{error}</div>}
    </div>
  )
}
