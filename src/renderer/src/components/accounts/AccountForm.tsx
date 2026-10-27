import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, ConfirmDialog, DateInput, Field, Input, Modal, Select } from '../ui'
import { useLedgerStore } from '../../store/ledger'
import { centsToInput, parseAccountDraft, type AccountDraft } from '../../lib/ledger'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { todayDateOnly } from '../../../../shared/date-only'
import { ACCOUNT_KINDS, INSTITUTIONS, type AccountSummary } from '../../../../shared/ledger'

export interface AccountFormProps {
  /** null = a new account */
  account: AccountSummary | null
  onClose: () => void
}

/** Add or edit an account; archiving lives here, behind a confirmation */
export function AccountForm({ account, onClose }: AccountFormProps) {
  const { t } = useTranslation()
  const formId = useId()
  const ids = { name: useId(), kind: useId(), institution: useId(), balance: useId(), date: useId() }
  const [draft, setDraft] = useState<AccountDraft>(() => account
    ? {
        name: account.name,
        kind: account.kind,
        institution: account.institution,
        openingBalance: (account.openingBalanceCents < 0 ? '-' : '') + centsToInput(account.openingBalanceCents),
        openingDate: account.openingDate,
      }
    : { name: '', kind: 'CURRENT', institution: 'OTHER', openingBalance: '', openingDate: todayDateOnly() })
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const parsed = parseAccountDraft(draft)
  const errors = submitted && 'errors' in parsed ? parsed.errors : {}
  const err = (key?: string) => (key ? t(`accounts.errors.${key}`) : undefined)
  const update = (patch: Partial<AccountDraft>) => {
    setDraft(d => ({ ...d, ...patch }))
    setServerError(null)
  }

  async function run(action: () => Promise<unknown>) {
    setSaving(true)
    try {
      await action()
      await useLedgerStore.getState().changed()
      onClose()
    } catch (error) {
      setServerError(ipcErrorMessage(error, t))
      setConfirmArchive(false)
    } finally {
      setSaving(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!('input' in parsed)) return
    void run(() => (account ? window.api.updateAccount(account.id, parsed.input) : window.api.createAccount(parsed.input)))
  }

  return (
    <>
      <Modal
        title={account ? t('accounts.edit_title') : t('accounts.add_title')}
        onClose={onClose}
        closeDisabled={saving}
        size="md"
        footer={
          <>
            {account && (
              <Button variant="ghost" icon="lock" className="mr-auto" onClick={() => setConfirmArchive(true)} disabled={saving}>
                {t('accounts.archive')}
              </Button>
            )}
            <Button variant="ghost" icon="close" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
            <Button type="submit" form={formId} variant="primary" icon="check" loading={saving}>
              {account ? t('accounts.save') : t('accounts.add')}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label={t('accounts.name')} htmlFor={ids.name} required error={err(errors.name)}>
            <Input id={ids.name} autoFocus value={draft.name} onChange={e => update({ name: e.target.value })} className="w-full" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('accounts.kind_label')} htmlFor={ids.kind}>
              <Select id={ids.kind} value={draft.kind} onChange={e => update({ kind: e.target.value as AccountDraft['kind'] })} className="w-full">
                {ACCOUNT_KINDS.map(k => <option key={k} value={k}>{t(`accounts.kind.${k}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('accounts.institution_label')} htmlFor={ids.institution}>
              <Select id={ids.institution} value={draft.institution} onChange={e => update({ institution: e.target.value as AccountDraft['institution'] })} className="w-full">
                {INSTITUTIONS.map(i => <option key={i} value={i}>{t(`accounts.institution.${i}`)}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t('accounts.opening_balance')}
              htmlFor={ids.balance}
              error={err(errors.openingBalance)}
              hint={draft.kind === 'CREDIT_CARD' ? t('accounts.opening_balance_card_hint') : t('accounts.opening_balance_hint')}
            >
              <Input id={ids.balance} inputMode="decimal" placeholder="0,00" value={draft.openingBalance} onChange={e => update({ openingBalance: e.target.value })} className="w-full tabular-nums" />
            </Field>
            <Field label={t('accounts.opening_date')} htmlFor={ids.date} required error={err(errors.openingDate)} hint={t('accounts.opening_date_hint')}>
              <DateInput id={ids.date} value={draft.openingDate} onChange={openingDate => update({ openingDate })} invalid={!!errors.openingDate} />
            </Field>
          </div>
          {serverError && <p role="alert" className="text-sm text-red-700">{serverError}</p>}
        </form>
      </Modal>

      {confirmArchive && account && (
        <ConfirmDialog
          title={t('accounts.archive_title', { name: account.name })}
          message={t('accounts.archive_message')}
          confirmLabel={t('accounts.archive')}
          confirmIcon="lock"
          tone="warning"
          loading={saving}
          onConfirm={() => void run(() => window.api.archiveAccount(account.id))}
          onCancel={() => setConfirmArchive(false)}
        />
      )}
    </>
  )
}
