import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Modal, Segmented } from '../ui'
import { useLedgerStore } from '../../store/ledger'
import { ipcErrorCode, ipcErrorMessage } from '../../lib/ipc-errors'
import type { InstitutionKind, InstitutionSummary } from '../../../../shared/ledger'

export interface BankFormProps {
  /** null = a new bank */
  bank: InstitutionSummary | null
  onClose: () => void
  /** The saved bank's id */
  onSaved: (id: string) => void
}

/** Name of a bank, and whether it holds accounts or issues meal-voucher cards */
export function BankForm({ bank, onClose, onSaved }: BankFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(bank?.name ?? '')
  const [kind, setKind] = useState<InstitutionKind>(bank?.kind ?? 'BANK')
  const [submitted, setSubmitted] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const formId = useId()
  const nameId = useId()

  const blank = name.trim() === ''
  const fieldError = nameError ?? (submitted && blank ? t('banks.name_required') : undefined)
  // Its accounts would no longer fit, so the kind is fixed while any use it
  const kindLocked = !!bank && bank.accountCount > 0

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (blank) return
    setSaving(true)
    try {
      const input = { name: name.trim(), kind }
      let id: string
      if (bank) {
        await window.api.updateInstitution(bank.id, input)
        id = bank.id
      } else {
        id = await window.api.createInstitution(input)
      }
      await useLedgerStore.getState().changed()
      onSaved(id)
    } catch (err) {
      // A taken name belongs next to the name field; anything else under the form
      if (ipcErrorCode(err) === 'INSTITUTION_NAME_TAKEN') setNameError(ipcErrorMessage(err, t))
      else setServerError(ipcErrorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={bank ? t('banks.edit_title') : t('banks.add_title')}
      onClose={onClose}
      closeDisabled={saving}
      size="sm"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" icon="check" loading={saving}>
            {bank ? t('banks.save') : t('banks.add')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('banks.name')} htmlFor={nameId} required error={fieldError} hint={t('banks.name_hint')}>
          <Input
            id={nameId}
            autoFocus
            autoComplete="off"
            maxLength={60}
            value={name}
            onChange={e => {
              setName(e.target.value)
              setNameError(null)
              setServerError(null)
            }}
            aria-invalid={!!fieldError}
            className="w-full"
          />
        </Field>
        <Field label={t('banks.kind_label')} hint={t(kindLocked ? 'banks.kind_locked' : 'banks.kind_hint')}>
          <Segmented<InstitutionKind>
            label={t('banks.kind_label')}
            value={kind}
            onChange={setKind}
            options={(['BANK', 'VOUCHER_ISSUER'] as const).map(k => ({
              value: k,
              label: t(`banks.kind.${k}`),
              icon: k === 'BANK' ? 'bank' as const : 'utensils' as const,
              disabled: kindLocked && k !== kind,
              title: kindLocked && k !== kind ? t('banks.kind_locked') : undefined,
            }))}
          />
        </Field>
        {serverError && <p role="alert" className="text-sm text-red-700">{serverError}</p>}
      </form>
    </Modal>
  )
}
