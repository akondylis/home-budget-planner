import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton, Input, cx } from '../ui'
import { ipcErrorMessage } from '../../lib/ipc-errors'

export interface InlineNameProps {
  /** Current name; empty for a new item */
  name: string
  /** Translated label of the field and of the pencil button, e.g. "Rename Fuel" */
  label: string
  /** Saves the trimmed name; a rejection is shown under the field */
  onSave: (name: string) => Promise<void>
  /** Starts open (a new item) */
  editing?: boolean
  onCancel?: () => void
  placeholder?: string
  className?: string
  /** How the name looks when not editing */
  textClassName?: string
}

/** A name that turns into a field: Enter saves, Esc cancels, errors sit under it */
export function InlineName({ name, label, onSave, editing: startEditing = false, onCancel, placeholder, className, textClassName }: InlineNameProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(startEditing)
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function cancel() {
    setDraft(name)
    setError(null)
    setEditing(false)
    onCancel?.()
  }

  async function save() {
    const value = draft.trim()
    if (!value) {
      setError(t('categories.name_required'))
      return
    }
    if (value === name) {
      cancel()
      return
    }
    setBusy(true)
    try {
      await onSave(value)
      setError(null)
      setEditing(false)
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className={cx('flex min-w-0 items-center gap-1', className)}>
        <span className={cx('break-words', textClassName)}>{name}</span>
        <IconButton icon="pencil" size="sm" label={label} onClick={() => { setDraft(name); setEditing(true) }} />
      </div>
    )
  }

  return (
    <div className={cx('min-w-0', className)}>
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={draft}
          maxLength={60}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          placeholder={placeholder}
          disabled={busy}
          onChange={e => { setDraft(e.target.value); setError(null) }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); void save() }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel() }
          }}
          className="h-8 min-w-0 flex-1"
        />
        <IconButton icon="check" size="sm" label={t('categories.save_name')} onClick={() => void save()} loading={busy} />
        <IconButton icon="close" size="sm" label={t('common.cancel')} onClick={cancel} disabled={busy} />
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}
