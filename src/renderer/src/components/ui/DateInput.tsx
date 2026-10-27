import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from './IconButton'
import { Input } from './Field'
import { cx } from './cx'
import { entryFormat, formatDate, getDateFormat, parseDate } from '../../lib/date-format'

export interface DateInputProps {
  id?: string
  /** 'yyyy-MM-dd', or '' for none */
  value: string
  /** Gets '' while the typed text is not a date, so the form's own check flags it */
  onChange: (value: string) => void
  invalid?: boolean
  className?: string
}

/** Moves a 'yyyy-MM-dd' day by `delta` days */
export function shiftDay(value: string, delta: number): string {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

/**
 * Date field in the format chosen in Settings (month-name formats are typed as
 * numbers). Type it ("5/3" = this year), nudge it with ↑/↓, or pick it from the
 * calendar button. The native date input is only the calendar: its own text
 * follows the Windows region, not the app.
 */
export function DateInput({ id, value, onChange, invalid, className }: DateInputProps) {
  const { t } = useTranslation()
  const format = entryFormat(getDateFormat())
  const show = (v: string) => (v ? formatDate(v, format) : '')
  const [text, setText] = useState(() => show(value))
  const pickerRef = useRef<HTMLInputElement>(null)

  // A new value from outside (calendar, reset) replaces the text; a half-typed date stays
  useEffect(() => {
    if ((parseDate(text, format) ?? '') !== value) setText(show(value))
  }, [value, format])

  function type(next: string) {
    setText(next)
    onChange(parseDate(next, format) ?? '')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !value) return
    e.preventDefault()
    const next = shiftDay(value, e.key === 'ArrowUp' ? 1 : -1)
    setText(show(next))
    onChange(next)
  }

  const pattern = format
    .replace('dd', t('ui.date_dd'))
    .replace('MM', t('ui.date_mm'))
    .replace('yyyy', t('ui.date_yyyy'))

  return (
    <div className={cx('relative', className)}>
      <Input
        id={id}
        value={text}
        inputMode="numeric"
        autoComplete="off"
        placeholder={pattern}
        title={t('ui.date_hint', { pattern })}
        aria-invalid={invalid || undefined}
        onChange={e => type(e.target.value)}
        onBlur={() => value && setText(show(value))}
        onKeyDown={onKeyDown}
        className="w-full pr-9 tabular-nums"
      />
      <IconButton
        icon="calendar"
        size="sm"
        label={t('ui.date_pick')}
        onClick={() => pickerRef.current?.showPicker()}
        className="absolute right-1 top-1/2 -translate-y-1/2"
      />
      {/* The calendar popup only; it opens under the button */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
    </div>
  )
}
