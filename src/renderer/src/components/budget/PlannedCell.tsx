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
}

/** Every Planned input on the page, in reading order, for ↑/↓ and Enter */
function moveFocus(from: HTMLInputElement, delta: 1 | -1) {
  const cells = [...document.querySelectorAll<HTMLInputElement>('input[data-planned-cell]')]
  const next = cells[cells.indexOf(from) + delta]
  if (next) {
    next.focus()
    next.select()
  }
}

/** Inline planned amount: saves on Enter or when focus leaves, Esc puts the saved amount back */
export function PlannedCell({ name, cents, onSave }: PlannedCellProps) {
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
    }
  }

  return (
    <div className="min-w-0">
      <div className="relative">
        <Input
          data-planned-cell
          inputMode="decimal"
          value={text}
          placeholder="0"
          aria-label={t('budget.planned_for', { name })}
          aria-invalid={error ? true : undefined}
          onChange={e => setText(e.target.value)}
          onFocus={e => { setFocused(true); e.currentTarget.select() }}
          onBlur={() => { setFocused(false); void commit() }}
          onKeyDown={onKeyDown}
          className={cx('h-8 w-full min-w-0 pr-6 text-right tabular-nums', error && 'border-red-500')}
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
