import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Popover } from '../ui'
import { useLedgerStore } from '../../store/ledger'

export interface BulkPayeeProps {
  /** How many rows it will change */
  count: number
  /** Shown first: the payee the ticked rows share, else '' */
  initial: string
  disabled?: boolean
  onApply: (payee: string | null) => void
}

/** "Set payee…" in the bulk toolbar: one name for every ticked row, with known payees as suggestions */
export function BulkPayee({ count, initial, disabled, onApply }: BulkPayeeProps) {
  const { t } = useTranslation()
  const payees = useLedgerStore(s => s.payees)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const ids = { input: useId(), list: useId() }

  function toggle() {
    if (!open) setValue(initial)
    setOpen(!open)
  }

  function submit() {
    setOpen(false)
    onApply(value.trim() || null)
  }

  return (
    <>
      <Button ref={anchorRef} icon="pencil" onClick={toggle} disabled={disabled} aria-expanded={open} aria-haspopup="dialog">
        {t('log.set_payee')}
      </Button>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} className="w-80 rounded-md border border-line bg-surface p-3 shadow-lg">
        <form
          role="dialog"
          aria-label={t('log.set_payee')}
          onSubmit={e => {
            e.preventDefault()
            submit()
          }}
          className="flex flex-col gap-3"
        >
          <Field label={t('log.payee_for', { count })} htmlFor={ids.input} hint={t('log.payee_clear_hint')}>
            <Input
              id={ids.input}
              list={ids.list}
              autoComplete="off"
              maxLength={120}
              value={value}
              onChange={e => setValue(e.target.value)}
              className="w-full"
              data-autofocus
            />
            <datalist id={ids.list}>
              {payees.map(p => <option key={p.payee} value={p.payee} />)}
            </datalist>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="sm" icon="check">
              {value.trim() ? t('log.apply_payee') : t('log.clear_payee')}
            </Button>
          </div>
        </form>
      </Popover>
    </>
  )
}
