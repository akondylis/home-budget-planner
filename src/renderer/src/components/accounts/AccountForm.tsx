import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, ConfirmDialog, DateInput, Field, Input, Modal, Segmented, Select } from '../ui'
import { BankPicker } from './BankPicker'
import { CardListEditor } from './CardListEditor'
import { MemberDot } from '../members/MemberDot'
import { useLedgerStore } from '../../store/ledger'
import { useUiStore } from '../../store/ui'
import { activeMembers } from '../../lib/members'
import { bankAfterKindChange } from '../../lib/banks'
import { centsToInput, parseAccountDraft, type AccountDraft } from '../../lib/ledger'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { todayDateOnly } from '../../../../shared/date-only'
import { ACCOUNT_KINDS, type AccountKind, type AccountSummary } from '../../../../shared/ledger'

export interface AccountFormProps {
  /** null = a new account */
  account: AccountSummary | null
  onClose: () => void
}

/** Add or edit an account with its holder and cards; archiving lives here, behind a confirmation */
export function AccountForm({ account, onClose }: AccountFormProps) {
  const { t } = useTranslation()
  const members = useLedgerStore(s => s.members)
  const formId = useId()
  const ids = { name: useId(), kind: useId(), balance: useId(), date: useId() }
  const [draft, setDraft] = useState<AccountDraft>(() => account
    ? {
        name: account.name,
        kind: account.kind,
        institutionId: account.institutionId,
        openingBalance: (account.openingBalanceCents < 0 ? '-' : '') + centsToInput(account.openingBalanceCents),
        openingDate: account.openingDate,
        holderMemberId: account.holderMemberId,
        cards: account.cards.map(c => ({ key: c.id, id: c.id, last4: c.last4, holderMemberId: c.holderMemberId })),
      }
    : { name: '', kind: 'CURRENT', institutionId: null, openingBalance: '', openingDate: todayDateOnly(), holderMemberId: null, cards: [] })
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  // Joint, then each parent; an archived parent stays listed when the account is already theirs
  const showMembers = activeMembers(members).length > 0
  const holderMembers = members.filter(m => !m.archived || m.id === account?.holderMemberId || draft.cards.some(c => c.holderMemberId === m.id))
  const voucher = draft.kind === 'MEAL_VOUCHER'

  const parsed = parseAccountDraft(draft, showMembers)
  const errors = submitted && 'errors' in parsed ? parsed.errors : {}
  const err = (key?: string) => (key ? t(`accounts.errors.${key}`) : undefined)
  const update = (patch: Partial<AccountDraft>) => {
    setDraft(d => ({ ...d, ...patch }))
    setServerError(null)
  }

  /** A meal-voucher card comes from a voucher issuer (Edenred, Up Hellas), and from one parent's employer (no joint) */
  function changeKind(kind: AccountKind) {
    const institutionId = bankAfterKindChange(useLedgerStore.getState().institutions, draft.institutionId, kind)
    if (kind !== 'MEAL_VOUCHER') return update({ kind, institutionId })
    update({
      kind,
      institutionId,
      holderMemberId: draft.holderMemberId ?? (showMembers ? useUiStore.getState().currentMemberId : null),
    })
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
              <Select id={ids.kind} value={draft.kind} onChange={e => changeKind(e.target.value as AccountKind)} className="w-full">
                {ACCOUNT_KINDS.map(k => <option key={k} value={k}>{t(`accounts.kind.${k}`)}</option>)}
              </Select>
            </Field>
            <BankPicker
              accountKind={draft.kind}
              value={draft.institutionId}
              onChange={institutionId => update({ institutionId })}
              storedId={account?.institutionId}
            />
          </div>
          {showMembers && (
            <Field label={t('accounts.holder')} required={voucher} hint={t(voucher ? 'accounts.holder_hint_voucher' : 'accounts.holder_hint')} error={err(errors.holder)}>
              <Segmented<string>
                label={t('accounts.holder')}
                value={draft.holderMemberId ?? ''}
                onChange={v => update({ holderMemberId: v || null })}
                options={[
                  ...(voucher ? [] : [{ value: '', label: t('accounts.holder_joint'), icon: 'users' as const }]),
                  ...holderMembers
                    .filter(m => !m.archived || m.id === draft.holderMemberId)
                    .map(m => ({ value: m.id, label: m.name, leading: <MemberDot colour={m.colour} size="md" /> })),
                ]}
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t('accounts.opening_balance')}
              htmlFor={ids.balance}
              error={err(errors.openingBalance)}
              hint={t(draft.kind === 'CREDIT_CARD' ? 'accounts.opening_balance_card_hint' : voucher ? 'accounts.opening_balance_voucher_hint' : 'accounts.opening_balance_hint')}
            >
              <Input id={ids.balance} inputMode="decimal" placeholder="0,00" value={draft.openingBalance} onChange={e => update({ openingBalance: e.target.value })} className="w-full tabular-nums" />
            </Field>
            <Field label={t('accounts.opening_date')} htmlFor={ids.date} required error={err(errors.openingDate)} hint={t('accounts.opening_date_hint')}>
              <DateInput id={ids.date} value={draft.openingDate} onChange={openingDate => update({ openingDate })} invalid={!!errors.openingDate} />
            </Field>
          </div>
          {draft.kind !== 'CASH' && (
            <Field label={t('accounts.cards')} hint={t(draft.kind === 'CREDIT_CARD' ? 'accounts.cards_hint_credit' : voucher ? 'accounts.cards_hint_voucher' : 'accounts.cards_hint_debit')}>
              <CardListEditor
                cards={draft.cards}
                onChange={cards => update({ cards })}
                members={showMembers ? holderMembers : []}
                defaultHolderId={draft.holderMemberId ?? useUiStore.getState().currentMemberId}
                errors={errors.cards}
              />
            </Field>
          )}
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
