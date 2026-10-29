import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner, Button, ConfirmDialog, DateInput, Field, Input, Modal, Money, Segmented, Select } from '../ui'
import { CategoryPicker } from './CategoryPicker'
import { MemberDot } from '../members/MemberDot'
import { Icon } from '../shell/icons'
import { activeAccounts, useLedgerStore, type EntryRequest } from '../../store/ledger'
import { useTransactionsStore } from '../../store/transactions'
import { useUiStore } from '../../store/ui'
import {
  canSendTransfer,
  defaultAccountId,
  defaultToAccountId,
  draftFromRow,
  findCategory,
  groupsFor,
  validateEntry,
  voucherShortfall,
  type EntryDraft,
  type FormKind,
} from '../../lib/ledger'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { activeMembers } from '../../lib/members'
import { parseMoney } from '../../../../shared/money'
import { todayDateOnly } from '../../../../shared/date-only'
import { signedAmount } from '../../../../shared/ledger'
import { HOUSEHOLD } from '../../../../shared/members'

export interface TransactionFormProps {
  request: EntryRequest
  onClose: () => void
}

/** Quick entry: amount first, the sign follows the type; Add & new keeps date and account for a pile of receipts */
export function TransactionForm({ request, onClose }: TransactionFormProps) {
  const { t } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const categories = useLedgerStore(s => s.categories)
  const payees = useLedgerStore(s => s.payees)
  const members = useLedgerStore(s => s.members)
  const editing = request.mode === 'edit' ? request.row : null
  const imported = editing?.importBatchId != null
  const ids = { amount: useId(), payee: useId(), date: useId(), account: useId(), to: useId(), note: useId(), payees: useId() }
  const amountRef = useRef<HTMLInputElement>(null)

  const [draft, setDraft] = useState<EntryDraft>(() => {
    if (editing) return draftFromRow(editing)
    const accountId = defaultAccountId(accounts, request.mode === 'create' ? request.accountId : null, useLedgerStore.getState().lastAccountId)
    return {
      kind: (request.mode === 'create' && request.kind) || 'EXPENSE',
      amount: '',
      accountId,
      toAccountId: defaultToAccountId(accounts, accountId),
      categoryId: null,
      payee: '',
      note: '',
      bookedAt: todayDateOnly(),
      memberId: null,
    }
  })
  const [original] = useState(draft)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<{ cents: number; label: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // A category picked by hand is never replaced by the payee's usual one
  const [categoryTouched, setCategoryTouched] = useState(editing !== null)
  // Likewise for who it is for
  const [memberTouched, setMemberTouched] = useState(editing !== null)

  const errors = submitted ? validateEntry(draft) : {}
  const err = (key?: string) => (key ? t(`entry.errors.${key}`) : undefined)
  const transfer = draft.kind === 'TRANSFER'
  const open = activeAccounts(accounts)
  // A meal-voucher card is never the source of a transfer
  const senders = open.filter(a => canSendTransfer(a.kind))
  const shortfall = voucherShortfall(accounts, draft, editing)
  const changedBankValues = imported && (draft.amount !== original.amount || draft.bookedAt !== original.bookedAt)
  // Household, then each parent; an archived parent stays listed on a row that is already theirs
  const forMembers = members.filter(m => !m.archived || m.id === original.memberId)
  const forOptions = activeMembers(members).length === 0 ? [] : [
    { value: HOUSEHOLD, label: t('members.household'), icon: 'home' as const },
    ...forMembers.map(m => ({ value: m.id, label: m.name, leading: <MemberDot colour={m.colour} size="md" /> })),
  ]

  function update(patch: Partial<EntryDraft>) {
    setDraft(d => ({ ...d, ...patch }))
    setServerError(null)
  }

  function changeKind(kind: FormKind) {
    setDraft(d => {
      const next = { ...d, kind }
      if (kind === 'TRANSFER' && !senders.some(a => a.id === d.accountId)) next.accountId = senders[0]?.id ?? ''
      if (kind === 'TRANSFER' && (!next.toAccountId || next.toAccountId === next.accountId)) {
        next.toAccountId = defaultToAccountId(accounts, next.accountId)
      }
      // A category of the other side (salary on an expense) no longer fits
      const category = findCategory(categories, d.categoryId)
      if (kind !== 'TRANSFER' && category && !groupsFor(categories, kind).some(g => g.type === category.type)) {
        next.categoryId = null
      }
      return next
    })
  }

  function changePayee(payee: string) {
    const known = payees.find(p => p.payee.toLocaleLowerCase() === payee.trim().toLocaleLowerCase())
    const fits = known?.categoryId && draft.kind !== 'TRANSFER'
      && groupsFor(categories, draft.kind).some(g => g.children.some(c => c.id === known.categoryId))
    const patch: Partial<EntryDraft> = fits && !categoryTouched ? { payee, categoryId: known!.categoryId } : { payee }
    if (known && !memberTouched && (known.memberId === null || forOptions.some(o => o.value === known.memberId))) {
      patch.memberId = known.memberId
    }
    update(patch)
  }

  async function save(andNew: boolean) {
    setSubmitted(true)
    const invalid = validateEntry(draft)
    if (Object.keys(invalid).length > 0) {
      // Take the user to the amount when that is what is missing; the other errors sit next to their fields
      if (invalid.amount) amountRef.current?.focus()
      return
    }
    const amountCents = parseMoney(draft.amount)!
    // Stamped on new rows only; the server never changes who entered a row
    const createdByMemberId = useUiStore.getState().currentMemberId
    setSaving(true)
    try {
      let key: string
      if (draft.kind === 'TRANSFER') {
        const input = { fromAccountId: draft.accountId, toAccountId: draft.toAccountId, amountCents, bookedAt: draft.bookedAt, note: draft.note }
        if (editing?.transferId) {
          await window.api.updateTransfer(editing.transferId, input)
          key = editing.transferId
        } else {
          key = await window.api.createTransfer({ ...input, createdByMemberId })
        }
      } else {
        const input = {
          kind: draft.kind,
          accountId: draft.accountId,
          amountCents,
          bookedAt: draft.bookedAt,
          categoryId: draft.categoryId,
          payee: draft.payee,
          note: draft.note,
          memberId: draft.memberId,
        }
        if (editing) {
          await window.api.updateTransaction(editing.id, input)
          key = editing.id
        } else {
          key = await window.api.createTransaction({ ...input, createdByMemberId })
        }
      }
      const ledger = useLedgerStore.getState()
      ledger.saved(key, draft.accountId)
      // Show the saved row: the log moves to its month when it is filtered to another one
      const log = useTransactionsStore.getState()
      if (log.filter.month && log.filter.month !== draft.bookedAt.slice(0, 7)) log.setFilter({ month: draft.bookedAt.slice(0, 7) })
      await ledger.changed()
      if (andNew) {
        const cents = draft.kind === 'TRANSFER' ? amountCents : signedAmount(draft.kind, amountCents)
        setLastSaved({ cents, label: draft.payee || findCategory(categories, draft.categoryId)?.name || t('entry.kind.TRANSFER') })
        setDraft(d => ({ ...d, amount: '', payee: '', note: '', categoryId: null }))
        setCategoryTouched(false)
        setMemberTouched(false)
        setSubmitted(false)
        amountRef.current?.focus()
      } else {
        onClose()
      }
    } catch (error) {
      setServerError(ipcErrorMessage(error, t))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!editing) return
    setSaving(true)
    try {
      await window.api.deleteTransaction(editing.id)
      await useLedgerStore.getState().changed()
      onClose()
    } catch (error) {
      setConfirmDelete(false)
      setServerError(ipcErrorMessage(error, t))
    } finally {
      setSaving(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void save(false)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !editing) {
      e.preventDefault()
      void save(true)
    }
  }

  // Expense ⇄ income can change on an existing row; a transfer stays a transfer
  const kindLocked = (kind: FormKind) => editing !== null && (kind === 'TRANSFER') !== (editing.transferId !== null)
  const primaryLabel = editing ? t('entry.save') : t(`entry.add.${draft.kind}`)
  const formId = useId()

  return (
    <>
      <Modal
        title={editing ? t('entry.edit_title') : t('entry.title')}
        onClose={onClose}
        closeDisabled={saving}
        size="md"
        footer={
          <>
            {editing && (
              <Button variant="ghost" icon="trash" className="mr-auto text-red-700" onClick={() => setConfirmDelete(true)} disabled={saving}>
                {t('entry.delete')}
              </Button>
            )}
            <Button variant="ghost" icon="close" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
            {!editing && (
              <Button icon="plus" onClick={() => save(true)} disabled={saving} title={t('entry.add_and_new_hint')}>
                {t('entry.add_and_new')}
              </Button>
            )}
            <Button type="submit" form={formId} variant="primary" icon="check" loading={saving}>{primaryLabel}</Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} onKeyDown={onKeyDown} className="space-y-4" noValidate>
          <Segmented<FormKind>
            label={t('entry.kind_label')}
            value={draft.kind}
            onChange={changeKind}
            options={(['EXPENSE', 'INCOME', 'TRANSFER'] as const).map(kind => ({
              value: kind,
              label: t(`entry.kind.${kind}`),
              icon: kind === 'EXPENSE' ? 'arrow-up' : kind === 'INCOME' ? 'arrow-down' : 'arrows-up-down',
              disabled: kindLocked(kind),
              title: kindLocked(kind) ? t('entry.kind_locked') : undefined,
            }))}
          />

          {lastSaved && (
            <Banner tone="success">
              {t('entry.saved_one')} <Money cents={lastSaved.cents} signed={!transfer} /> · {lastSaved.label}
            </Banner>
          )}

          <Field label={t('entry.amount')} htmlFor={ids.amount} required error={err(errors.amount)} hint={t(`entry.amount_hint.${draft.kind}`)}>
            <Input
              ref={amountRef}
              id={ids.amount}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              placeholder="0,00"
              value={draft.amount}
              onChange={e => update({ amount: e.target.value })}
              aria-invalid={!!errors.amount}
              className="w-48 text-lg tabular-nums"
            />
          </Field>

          {transfer ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('entry.from')} htmlFor={ids.account} required error={err(errors.accountId)}>
                <Select id={ids.account} value={draft.accountId} onChange={e => update({ accountId: e.target.value })} className="w-full">
                  {senders.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
              <Field label={t('entry.to')} htmlFor={ids.to} required error={err(errors.toAccountId)}>
                <Select id={ids.to} value={draft.toAccountId} onChange={e => update({ toAccountId: e.target.value })} className="w-full">
                  <option value="" disabled>{t('entry.choose_account')}</option>
                  {open.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
            </div>
          ) : (
            <>
              <Field label={t('entry.category')} required error={err(errors.categoryId)}>
                <CategoryPicker
                  categories={categories}
                  value={draft.categoryId}
                  kind={draft.kind === 'INCOME' ? 'INCOME' : 'EXPENSE'}
                  ariaLabel={t('entry.category')}
                  onChange={categoryId => {
                    setCategoryTouched(true)
                    update({ categoryId })
                  }}
                />
              </Field>
              <Field label={t('entry.payee')} htmlFor={ids.payee} hint={t('entry.payee_hint')}>
                <Input
                  id={ids.payee}
                  list={ids.payees}
                  autoComplete="off"
                  value={draft.payee}
                  onChange={e => changePayee(e.target.value)}
                  className="w-full"
                />
                <datalist id={ids.payees}>
                  {payees.map(p => <option key={p.payee} value={p.payee} />)}
                </datalist>
              </Field>
              {forOptions.length > 0 && (
                <Field label={t('entry.for')} hint={t('entry.for_hint')}>
                  <Segmented<string>
                    label={t('entry.for')}
                    value={draft.memberId ?? HOUSEHOLD}
                    onChange={value => {
                      setMemberTouched(true)
                      update({ memberId: value === HOUSEHOLD ? null : value })
                    }}
                    options={forOptions}
                  />
                </Field>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('entry.date')} htmlFor={ids.date} required error={err(errors.bookedAt)}>
              <DateInput id={ids.date} value={draft.bookedAt} onChange={bookedAt => update({ bookedAt })} invalid={!!errors.bookedAt} />
            </Field>
            {!transfer && (
              <Field
                label={t('entry.account')}
                htmlFor={ids.account}
                required
                error={err(errors.accountId)}
                hint={shortfall !== null && (
                  // A warning, not a block: the opening balance or a top-up may simply be missing
                  <span role="status" className="flex items-start gap-1 text-amber-700">
                    <Icon name="alert-triangle" size={12} className="mt-0.5 shrink-0" />
                    <span>{t('entry.voucher_overdraw')} <Money cents={shortfall} /></span>
                  </span>
                )}
              >
                <Select id={ids.account} value={draft.accountId} onChange={e => update({ accountId: e.target.value })} className="w-full">
                  {open.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
            )}
          </div>

          <Field label={t('entry.note')} htmlFor={ids.note}>
            <Input id={ids.note} value={draft.note} onChange={e => update({ note: e.target.value })} className="w-full" />
          </Field>

          {editing?.createdByName && (
            <p className="text-xs text-gray-500">{t('entry.entered_by', { name: editing.createdByName })}</p>
          )}
          {changedBankValues && <Banner tone="warning">{t('entry.differs_from_statement')}</Banner>}
          {serverError && <p role="alert" className="text-sm text-red-700">{serverError}</p>}
        </form>
      </Modal>

      {confirmDelete && (
        <ConfirmDialog
          title={t('entry.delete_title')}
          message={editing?.transferId ? t('entry.delete_transfer_message') : t('entry.delete_message')}
          confirmLabel={t('entry.delete')}
          confirmIcon="trash"
          tone="danger"
          loading={saving}
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
