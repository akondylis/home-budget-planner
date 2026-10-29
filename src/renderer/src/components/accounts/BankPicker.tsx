import { useId, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, IconButton, Input, Select } from '../ui'
import { useLedgerStore } from '../../store/ledger'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { banksFor } from '../../lib/banks'
import { institutionKindFor, type AccountKind } from '../../../../shared/ledger'

/** The select value that opens the "new bank" field */
const NEW = '__new__'

export interface BankPickerProps {
  accountKind: AccountKind
  /** null = no bank */
  value: string | null
  onChange: (institutionId: string | null) => void
  /** The bank already saved on the account: stays offered even when archived */
  storedId?: string | null
}

/**
 * The account's bank (or meal-card issuer), with "New bank…" at the end of the list:
 * the select turns into a name field, and the bank added is selected.
 */
export function BankPicker({ accountKind, value, onChange, storedId = null }: BankPickerProps) {
  const { t } = useTranslation()
  const institutions = useLedgerStore(s => s.institutions)
  const selectId = useId()
  const nameId = useId()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const kind = institutionKindFor(accountKind)
  const voucher = kind === 'VOUCHER_ISSUER'
  const label = t(voucher ? 'accounts.institution_label_voucher' : 'accounts.institution_label')
  const options = banksFor(institutions, kind, [value, storedId])

  function cancel() {
    setAdding(false)
    setName('')
    setError(null)
  }

  async function add() {
    if (!name.trim()) return setError(t('banks.name_required'))
    setSaving(true)
    try {
      const id = await window.api.createInstitution({ name: name.trim(), kind })
      await useLedgerStore.getState().changed()
      onChange(id)
      cancel()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  // Enter adds the bank instead of saving the whole account; Escape leaves the field, not the dialog
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void add()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancel()
    }
  }

  if (adding) {
    // Spans both columns of the form's grid, so the name and its buttons have room
    return (
      <Field className="col-span-2" label={t(voucher ? 'accounts.new_issuer_label' : 'accounts.new_bank_label')} htmlFor={nameId} error={error} hint={t('accounts.new_bank_hint')}>
        <div className="flex items-center gap-1.5">
          <Input
            id={nameId}
            autoFocus
            autoComplete="off"
            maxLength={60}
            value={name}
            onChange={e => {
              setName(e.target.value)
              setError(null)
            }}
            onKeyDown={onKeyDown}
            aria-invalid={!!error}
            className="min-w-0 flex-1"
          />
          <Button size="sm" icon="check" onClick={() => void add()} loading={saving}>{t('banks.add_short')}</Button>
          <IconButton icon="close" size="sm" label={t('common.cancel')} onClick={cancel} disabled={saving} />
        </div>
      </Field>
    )
  }

  return (
    <Field label={label} htmlFor={selectId}>
      <Select
        id={selectId}
        value={value ?? ''}
        onChange={e => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value || null))}
        className="w-full"
      >
        <option value="">{t('accounts.no_bank')}</option>
        {options.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        <option value={NEW}>{t(voucher ? 'accounts.new_issuer' : 'accounts.new_bank')}</option>
      </Select>
    </Field>
  )
}
